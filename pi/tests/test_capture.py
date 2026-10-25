import io
import json
import threading
import time
from unittest.mock import MagicMock
from pathlib import Path

from capture import PiRelay


def test_metadata_precedes_photo_and_carries_capture_time(monkeypatch):
    s3 = MagicMock()
    relay = PiRelay(s3, "test")
    monkeypatch.setattr("capture.shutil.which", lambda _: "/usr/bin/fswebcam")
    monkeypatch.setattr("capture.subprocess.run", lambda args, **kw: Path(args[-1]).write_bytes(b"\xff\xd8\xfftest"))
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
        Path(args[0][-1]).write_bytes(b"\xff\xd8\xfftest")
        with lock: active -= 1
    monkeypatch.setattr("capture.shutil.which", lambda _: "/usr/bin/fswebcam")
    monkeypatch.setattr("capture.subprocess.run", shoot)
    relay = PiRelay(MagicMock(), "test")
    threads = [threading.Thread(target=relay.capture, args=(str(i),)) for i in range(3)]
    for thread in threads: thread.start()
    for thread in threads: thread.join()
    assert maximum == 1


def relay_with_capture(monkeypatch, tmp_path):
    relay = PiRelay(MagicMock(), "test", tmp_path / "spool")
    def capture(path):
        path.write_bytes(b"\xff\xd8\xfftest")
        return "2026-10-25T12:00:00+00:00"
    monkeypatch.setattr(relay, "capture_file", capture)
    return relay


def test_voice_uploads_both_assets_then_ready_without_web(monkeypatch, tmp_path):
    relay = relay_with_capture(monkeypatch, tmp_path)
    identifier = relay.queue_voice(b"OggS-recording")
    relay.s3.assert_not_called()
    relay.s3.upload_file.assert_not_called()
    assert (relay.spool / identifier / "audio.ogg").exists()
    relay.flush_voice()
    calls = relay.s3.method_calls
    assert [call[0] for call in calls] == ["upload_file", "upload_file", "put_object"]
    assert calls[0].args[2] == f"incoming/device/{identifier}.ogg"
    assert calls[1].args[2] == f"incoming/device/{identifier}.jpeg"
    manifest = json.loads(calls[2].kwargs["Body"])
    assert manifest["id"] == identifier and manifest["source"] == "device"
    assert calls[2].kwargs["Key"] == f"incoming/device/{identifier}.ready.json"
    assert not (relay.spool / identifier).exists()


def test_failed_upload_is_retained_and_retried_with_same_id(monkeypatch, tmp_path):
    relay = relay_with_capture(monkeypatch, tmp_path)
    identifier = relay.queue_voice(b"OggS-recording")
    relay.s3.upload_file.side_effect = [None, RuntimeError("offline")]
    relay.flush_voice()
    relay.s3.put_object.assert_not_called()
    assert (relay.spool / identifier / "audio.ogg").exists()
    relay.s3.upload_file.side_effect = None
    relay.flush_voice()
    assert relay.s3.put_object.call_args.kwargs["Key"] == f"incoming/device/{identifier}.ready.json"


def test_spool_survives_process_restart(monkeypatch, tmp_path):
    relay = relay_with_capture(monkeypatch, tmp_path)
    identifier = relay.queue_voice(b"OggS-recording")
    restarted = PiRelay(relay.s3, "test", relay.spool)
    restarted.flush_voice()
    assert restarted.s3.put_object.call_args.kwargs["Key"] == f"incoming/device/{identifier}.ready.json"


def test_camera_failure_retains_audio_for_retry(monkeypatch, tmp_path):
    relay = relay_with_capture(monkeypatch, tmp_path)
    capture = relay.capture_file
    monkeypatch.setattr(relay, "capture_file", MagicMock(side_effect=RuntimeError("camera")))
    identifier = relay.queue_voice(b"OggS-recording")
    assert (relay.spool / identifier / "audio.ogg").exists()
    monkeypatch.setattr(relay, "capture_file", capture)
    relay.flush_voice()
    assert relay.s3.put_object.call_args.kwargs["Key"] == f"incoming/device/{identifier}.ready.json"
