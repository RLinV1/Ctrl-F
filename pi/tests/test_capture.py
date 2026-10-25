import io
import json
import threading
import time
from unittest.mock import MagicMock

from capture import PiRelay


def test_metadata_precedes_photo_and_carries_capture_time(monkeypatch):
    s3 = MagicMock()
    relay = PiRelay(s3, "test")
    monkeypatch.setattr("capture.shutil.which", lambda _: "/usr/bin/fswebcam")
    monkeypatch.setattr("capture.subprocess.run", lambda *a, **kw: None)
    relay.capture("job", b'{"targets":["keys"]}', prefix="incoming")
    metadata = json.loads(s3.put_object.call_args.kwargs["Body"])
    assert metadata["targets"] == ["keys"] and "+00:00" in metadata["captured_at"]
    assert [call[0] for call in s3.mock_calls] == ["put_object", "upload_file"]


def test_failure_requeues_same_id(monkeypatch):
    s3 = MagicMock()
    s3.get_paginator.return_value.paginate.return_value = [{"Contents": [{"Key":"jobs/id.json"}]}]
    s3.get_object.return_value = {"Body": io.BytesIO(b'{"targets":["keys"]}')}
    relay = PiRelay(s3, "test")
    monkeypatch.setattr(relay, "capture", MagicMock(side_effect=RuntimeError("camera unavailable")))
    relay.poll_once()
    assert s3.delete_object.call_args.kwargs["Key"] == "jobs/id.json"
    assert s3.put_object.call_args.kwargs["Key"] == "jobs/id.json"


def test_camera_is_serialized_between_button_and_queue(monkeypatch):
    active = 0
    maximum = 0
    lock = threading.Lock()
    def shoot(*args, **kwargs):
        nonlocal active, maximum
        with lock:
            active += 1
            maximum = max(maximum, active)
        time.sleep(.01)
        with lock: active -= 1
    monkeypatch.setattr("capture.shutil.which", lambda _: "/usr/bin/fswebcam")
    monkeypatch.setattr("capture.subprocess.run", shoot)
    relay = PiRelay(MagicMock(), "test")
    threads = [threading.Thread(target=relay.capture, args=(str(i),)) for i in range(3)]
    for thread in threads: thread.start()
    for thread in threads: thread.join()
    assert maximum == 1
