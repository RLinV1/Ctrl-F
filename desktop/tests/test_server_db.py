"""server.process() writes S3 first, then Postgres. YOLO and S3 are faked."""

import importlib
import io
import json
import sys
import types
import uuid
from datetime import UTC, datetime
from typing import ClassVar

import pytest
from botocore.exceptions import ClientError
from sqlalchemy import select
from sqlalchemy.orm import Session

from ctrlf_db.models import Detection, Item, Job, Photo
from ctrlf_db.seed import add_items

from .conftest import TEST_URL

TAKEN = datetime(2026, 10, 24, 12, 0, tzinfo=UTC)


class FakeList(list):
    def tolist(self) -> list:
        return list(self)


class FakeResult:
    names: ClassVar[dict[int, str]] = {0: "keys", 1: "person"}
    orig_shape = (720, 1280)  # height, width
    boxes = types.SimpleNamespace(
        cls=FakeList([0.0, 1.0]),
        conf=FakeList([0.91, 0.5]),
        xyxyn=FakeList([[0.6, 0.5, 0.8, 0.7], [0.1, 0.1, 0.3, 0.9]]),
    )

    def save(self, filename: str) -> None:
        pass


class FakeS3:
    """Like S3, only the exact key `incoming/<id>.json` holds the request."""

    def __init__(self, targets: list[str], request_key: str | None = None) -> None:
        self.targets = targets
        self.request_key = request_key
        self.written: list[str] = []

    def download_file(self, bucket: str, key: str, dest: str) -> None:
        open(dest, "wb").close()

    def get_object(self, Bucket: str, Key: str) -> dict:
        if not self.targets or Key != self.request_key:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": io.BytesIO(json.dumps({"targets": self.targets}).encode())}

    def put_object(self, Bucket: str, Key: str, Body: bytes) -> None:
        self.written.append(Key)

    def upload_file(self, src: str, bucket: str, key: str) -> None:
        self.written.append(key)


@pytest.fixture
def server(monkeypatch: pytest.MonkeyPatch, session: Session):
    fake_ultralytics = types.ModuleType("ultralytics")
    fake_ultralytics.YOLO = lambda weights: lambda src: [FakeResult()]
    monkeypatch.setitem(sys.modules, "ultralytics", fake_ultralytics)
    for k, v in {
        "S3_BUCKET": "test",
        "S3_ACCESS_KEY_ID": "x",
        "S3_SECRET_ACCESS_KEY": "x",
        "DATABASE_URL": TEST_URL,
        "YOLO_WEIGHTS_PATH": "models/v4/best.pt",
    }.items():
        monkeypatch.setenv(k, v)
    sys.modules.pop("server", None)
    mod = importlib.import_module("server")
    yield mod
    sys.modules.pop("server", None)


def test_process_stores_photo_detections_and_job(server, session: Session) -> None:
    add_items(session, ["keys", "wallet"])
    job = uuid.uuid4()
    # The exact key matters: on Windows a pathlib.Path key would become "incoming\<id>.json".
    server.s3 = FakeS3(targets=["keys", "wallet"], request_key=f"incoming/{job}.json")
    server.process(f"incoming/{job}.jpg", TAKEN)

    assert server.s3.written == [f"results/{job}_result.json", f"results/{job}_result.jpg"]
    photo = session.scalars(select(Photo)).one()
    assert (
        photo.s3_key,
        photo.annotated_key,
        photo.width,
        photo.height,
        photo.taken_at,
        photo.model_version,
        photo.job_id,
    ) == (f"incoming/{job}.jpg", f"results/{job}_result.jpg", 1280, 720, TAKEN, "best.pt", job)
    labels = {d.label: d.item_id for d in session.scalars(select(Detection))}
    assert labels["person"] is None and labels["keys"] is not None
    items = {i.name: i for i in session.scalars(select(Item))}
    assert items["keys"].last_seen_at == TAKEN and items["wallet"].lost_count == 1
    assert session.get(Job, job).found is True


def test_db_failure_keeps_s3_results(server, capsys: pytest.CaptureFixture) -> None:
    def broken():
        raise RuntimeError("database down")

    server.db = broken
    server.s3 = FakeS3(targets=[])
    server.process("incoming/manual.jpg", TAKEN)

    assert server.s3.written == ["results/manual_result.json", "results/manual_result.jpg"]
    assert "db write failed for incoming/manual.jpg: database down" in capsys.readouterr().out
