"""Worker publishes only persisted successes; S3, Hermes and DB boundaries are mocked."""

import io
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from PIL import Image
from botocore.exceptions import ClientError

import processing
from hermes import Observation, Scene
from server import Worker

TAKEN = datetime(2026, 10, 24, 12, tzinfo=UTC)


class FakeS3:
    def __init__(self):
        self.objects = {}
        self.written = []

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        return {"Body": io.BytesIO(self.objects[Key])}

    def put_object(self, Bucket, Key, Body, **kwargs):
        self.written.append(Key)
        self.objects[Key] = Body

    def head_object(self, Bucket, Key):
        self.get_object(Bucket, Key)


class Session:
    def __init__(self, items): self.items = items
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def begin(self): return self
    def execute(self, query): pass
    def scalar(self, query): return None
    def scalars(self, query): return SimpleNamespace(all=lambda: self.items)


def jpeg():
    out = io.BytesIO()
    Image.new("RGB", (100, 80)).save(out, "JPEG")
    return out.getvalue()


def test_every_observation_persisted_and_absent_target_uses_verified_memory(monkeypatch):
    items = [SimpleNamespace(name="keys", aliases=["keyring"], id="keys-id"),
             SimpleNamespace(name="wallet", aliases=[], id="wallet-id")]
    sessions = lambda: Session(items)
    observation = Observation("wallet", {"x": .1, "y": .2, "w": .2, "h": .2}, "On the desk")
    agent = Mock()
    agent.analyze.side_effect = lambda image, photo, catalog, targets: Scene(photo, "hermes-agent", (observation,))
    agent.recall.return_value = {"status": "available", "detection_id": "prior-id"}
    prior = {"detection_id": "prior-id", "location_description": "Beside the mug"}
    monkeypatch.setattr(processing.repo, "lookup_last_sighting", lambda *args: prior)
    saved = Mock()
    monkeypatch.setattr(processing.repo, "save_result", saved)
    facts, annotated = processing.process_photo(jpeg(), "incoming/test.jpg", TAKEN, ["keyring"], agent, sessions)
    assert facts["status"] == "not_visible" and facts["history_status"] == "available"
    assert facts["last_sighting"] == prior
    assert saved.call_args.kwargs["boxes"][0].label == "wallet"
    assert saved.call_args.kwargs["boxes"][0].confidence is None
    assert saved.call_args.kwargs["targets"] == ["keys"]
    assert annotated.startswith(b"\xff\xd8\xff")


def test_invented_history_not_trusted(monkeypatch):
    sessions = lambda: Session([SimpleNamespace(name="keys", aliases=[], id="keys-id")])
    agent = Mock()
    agent.analyze.side_effect = lambda image, photo, *args: Scene(photo, "hermes-agent", ())
    agent.recall.return_value = {"status": "available", "detection_id": "invented"}
    monkeypatch.setattr(processing.repo, "lookup_last_sighting", lambda *args: {"detection_id": "real"})
    monkeypatch.setattr(processing.repo, "save_result", Mock())
    facts, _ = processing.process_photo(jpeg(), "incoming/test.jpg", TAKEN, ["keys"], agent, sessions)
    assert facts["history_status"] == "unavailable" and facts["last_sighting"] is None


def test_database_failure_does_not_publish_success(monkeypatch):
    s3 = FakeS3()
    s3.objects["incoming/test.jpg"] = jpeg()
    monkeypatch.setattr("server.process_photo", Mock(side_effect=RuntimeError("secret database details")))
    worker = Worker(s3, "test", Mock(), Mock())
    worker.process("incoming/test.jpg", TAKEN)
    facts = json.loads(s3.objects["results/test_result.json"])
    assert facts["status"] == "failed" and not facts["persisted"]
    assert "secret" not in str(facts)
    assert not worker.has_result("incoming/test.jpg")
    assert "results/test_result.jpg" not in s3.objects


def test_capture_time_and_completion_order(monkeypatch):
    s3 = FakeS3()
    s3.objects["incoming/test.jpg"] = jpeg()
    s3.objects["incoming/test.json"] = json.dumps({"targets": ["keys"], "captured_at": TAKEN.isoformat()}).encode()
    fn = Mock(return_value=({"version": 2, "status": "found", "persisted": True}, b"annotated"))
    monkeypatch.setattr("server.process_photo", fn)
    worker = Worker(s3, "test", Mock(), Mock())
    worker.process("incoming/test.jpg", datetime.now(UTC))
    assert fn.call_args.args[2] == TAKEN
    assert s3.written == ["results/test_result.json", "results/test_result.jpg"]
    assert worker.has_result("incoming/test.jpg")


def test_analysis_failure_never_writes_observations(monkeypatch):
    saved = Mock()
    monkeypatch.setattr(processing.repo, "save_result", saved)
    agent = Mock()
    agent.analyze.side_effect = RuntimeError("provider failed")
    with pytest.raises(RuntimeError):
        processing.process_photo(jpeg(), "incoming/test.jpg", TAKEN, ["keys"], agent,
                                  lambda: Session([SimpleNamespace(name="keys", aliases=[], id="keys-id")]))
    saved.assert_not_called()


def test_publication_retry_uses_persisted_scene(monkeypatch):
    from types import SimpleNamespace
    prior = SimpleNamespace(id="photo-id", taken_at=TAKEN, width=100, height=80, model_version="deployed-agent")
    det = SimpleNamespace(item_id="keys-id", label="keys", confidence=None,
                          bbox={"x":.1,"y":.2,"w":.2,"h":.2}, location_description="On the desk")
    class ExistingSession(Session):
        def scalar(self, query): return prior
        def scalars(self, query):
            is_items = query.column_descriptions[0]["entity"].__name__ == "Item"
            return SimpleNamespace(all=lambda: self.items if is_items else [det])
    items = [SimpleNamespace(id="keys-id", name="keys", aliases=[])]
    agent = Mock()
    monkeypatch.setattr(processing.repo, "save_result", Mock())
    facts, _ = processing.process_photo(jpeg(), "incoming/test.jpg", datetime.now(UTC), ["keys"], agent,
                                       lambda: ExistingSession(items))
    agent.analyze.assert_not_called()
    assert facts["captured_at"] == TAKEN.isoformat()
    assert facts["matches"][0]["location_description"] == "On the desk"


def test_worker_requires_database_before_connecting(monkeypatch):
    monkeypatch.setattr("server.load_dotenv", lambda *a, **kw: None)
    monkeypatch.setenv("HERMES_BASE_URL", "http://127.0.0.1:8642/v1")
    monkeypatch.setenv("HERMES_API_KEY", "test")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from server import main
    with pytest.raises(SystemExit, match="DATABASE_URL"):
        main()


def test_local_lookup_precedes_chat_and_rechecks_newest_evidence(monkeypatch):
    sessions = lambda: Session([SimpleNamespace(name="keys", aliases=[], id="keys-id")])
    old = {"detection_id": "old-id"}
    newer = {"detection_id": "newer-id"}
    lookup = Mock(side_effect=[old, newer])
    monkeypatch.setattr(processing.repo, "lookup_last_sighting", lookup)
    monkeypatch.setattr(processing.repo, "save_result", Mock())
    agent = Mock()
    agent.analyze.side_effect = lambda image, photo, *args: Scene(photo, "hermes-agent", ())
    def recall(item, before, supplied):
        assert lookup.call_count == 1
        assert supplied == old
        return {"status": "available", "detection_id": "old-id"}
    agent.recall.side_effect = recall
    facts, _ = processing.process_photo(jpeg(), "incoming/test.jpg", TAKEN, ["keys"], agent, sessions)
    assert facts["history_status"] == "unavailable"
    assert facts["last_sighting"] is None


@pytest.mark.parametrize("outcome", ["empty", "database-failure", "api-failure"])
def test_absent_history_outcomes(monkeypatch, outcome):
    sessions = lambda: Session([SimpleNamespace(name="keys", aliases=[], id="keys-id")])
    lookup = Mock(return_value=None)
    if outcome == "database-failure":
        lookup.side_effect = RuntimeError("private database details")
    monkeypatch.setattr(processing.repo, "lookup_last_sighting", lookup)
    monkeypatch.setattr(processing.repo, "save_result", Mock())
    agent = Mock()
    agent.analyze.side_effect = lambda image, photo, *args: Scene(photo, "hermes-agent", ())
    agent.recall.return_value = {"status": "never_seen"}
    if outcome == "api-failure":
        agent.recall.side_effect = RuntimeError("private provider details")
    facts, _ = processing.process_photo(jpeg(), "incoming/test.jpg", TAKEN, ["keys"], agent, sessions)
    assert facts["history_status"] == ("never_seen" if outcome == "empty" else "unavailable")
    if outcome == "database-failure":
        agent.recall.assert_not_called()
