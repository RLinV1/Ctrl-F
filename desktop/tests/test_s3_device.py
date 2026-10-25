import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock
from uuid import uuid4

import pytest

from server import Worker, validate_device_manifest
from .test_server_db import FakeS3, jpeg

NOW = datetime.now(UTC)


def manifest():
    identifier = str(uuid4())
    return {"version":1,"source":"device","id":identifier,"created_at":NOW.isoformat(),"captured_at":NOW.isoformat(),
            "audio_key":f"incoming/device/{identifier}.ogg","image_key":f"incoming/device/{identifier}.jpeg",
            "audio_content_type":"audio/ogg"}


def setup(request):
    s3 = FakeS3()
    key = f"incoming/device/{request['id']}.ready.json"
    s3.objects[key] = json.dumps(request).encode()
    s3.objects[request["audio_key"]] = b"OggS-audio"
    s3.objects[request["image_key"]] = jpeg()
    s3.head_object = lambda Bucket,Key: {"ContentLength":len(s3.get_object(Bucket,Key)["Body"].read())}
    s3.get_paginator = lambda _: SimpleNamespace(paginate=lambda **kw: [{"Contents":[{"Key":key,"LastModified":NOW}]}])
    return s3


def test_ready_assets_transcribed_and_source_published(monkeypatch):
    request = manifest()
    s3 = setup(request)
    sessions = MagicMock()
    transcribe = Mock(return_value="Where are my keys?")
    prepared = Mock(return_value=("Where are my keys?", ["keys"]))
    monkeypatch.setattr("server.prepare_question",prepared)
    monkeypatch.setattr("server.prepare_photo",Mock())
    processed = Mock(return_value=({"version":2,"status":"found","persisted":True},b"annotated"))
    monkeypatch.setattr("server.process_photo",processed)
    worker = Worker(s3,"test",Mock(),sessions,transcribe)
    worker.poll()
    facts = json.loads(s3.objects[f"results/{request['id']}_result.json"])
    assert facts["source"] == "device" and facts["transcript"] == "Where are my keys?"
    assert facts["targets"] == ["keys"] and facts["created_at"] == request["created_at"]
    assert prepared.call_args.args[-1] is transcribe
    worker.poll()
    assert processed.call_count == 1


def test_missing_asset_is_ignored_without_stt_or_failure_publication():
    request = manifest()
    s3 = setup(request)
    del s3.objects[request["audio_key"]]
    transcribe = Mock()
    worker = Worker(s3,"test",Mock(),MagicMock(),transcribe)
    worker.poll()
    transcribe.assert_not_called()
    assert not s3.written


def test_no_ready_marker_means_no_processing():
    request = manifest()
    s3 = setup(request)
    s3.get_paginator = lambda _: SimpleNamespace(paginate=lambda **kw: [{"Contents":[
        {"Key":request["image_key"],"LastModified":NOW}, {"Key":request["audio_key"],"LastModified":NOW}]}])
    transcribe = Mock()
    worker = Worker(s3,"test",Mock(),MagicMock(),transcribe)
    worker.poll()
    transcribe.assert_not_called()
    assert not s3.written


def test_stt_failure_publishes_safe_device_error(monkeypatch):
    request = manifest()
    s3 = setup(request)
    monkeypatch.setattr("server.prepare_question",Mock(side_effect=RuntimeError("private-key")))
    monkeypatch.setattr("server.prepare_photo",Mock())
    processing = Mock()
    monkeypatch.setattr("server.process_photo",processing)
    Worker(s3,"test",Mock(),MagicMock(),Mock()).poll()
    facts = json.loads(s3.objects[f"results/{request['id']}_result.json"])
    assert facts["status"] == "failed" and facts["source"] == "device"
    assert "private-key" not in str(facts)
    processing.assert_not_called()


@pytest.mark.parametrize("field,value", [("audio_key","incoming/someone-else.ogg"),("image_key","private/other.jpg"),
                                         ("created_at","2026-10-25T12:00:00"),("audio_content_type","text/plain")])
def test_untrusted_manifest_cannot_select_arbitrary_assets(field,value):
    request = manifest()
    request[field] = value
    with pytest.raises(ValueError):
        validate_device_manifest(f"incoming/device/{request['id']}.ready.json",request)


def test_transcription_overlaps_preparation_but_vision_keeps_descriptive_targets(monkeypatch):
    from threading import Event, get_ident
    from .test_server_db import Session
    import processing
    request = manifest()
    s3 = setup(request)
    speech_started, image_started = Event(), Event()
    sessions_used = []
    def sessions():
        session = Session([])
        sessions_used.append((session,get_ident()))
        return session
    def question(*args):
        speech_started.set()
        assert image_started.wait(2), "Image preparation did not overlap speech"
        return "Find my red water bottle",["red water bottle"]
    real_prepare = processing.prepare_photo
    def prepare(*args):
        image_started.set()
        assert speech_started.wait(2), "Speech did not overlap image preparation"
        return real_prepare(*args)
    processed = Mock(return_value=({"status":"found","persisted":True},b"annotated"))
    monkeypatch.setattr("server.prepare_question",question)
    monkeypatch.setattr("server.prepare_photo",prepare)
    monkeypatch.setattr("server.process_photo",processed)
    Worker(s3,"test",Mock(),sessions,Mock()).poll()
    assert processed.call_args.args[3] == ["red water bottle"]
    assert processed.call_args.kwargs["prepared"].photo.key == request["image_key"]
    assert len({id(session) for session,_ in sessions_used}) == 2
    assert len({thread for _,thread in sessions_used}) == 2


def test_image_preparation_failure_does_not_run_vision_or_publish_success(monkeypatch):
    request = manifest()
    s3 = setup(request)
    monkeypatch.setattr("server.prepare_question",Mock(return_value=("Find keys",["keys"])))
    monkeypatch.setattr("server.prepare_photo",Mock(side_effect=RuntimeError("private-image-details")))
    process = Mock()
    monkeypatch.setattr("server.process_photo",process)
    Worker(s3,"test",Mock(),MagicMock(),Mock()).poll()
    facts = json.loads(s3.objects[f"results/{request['id']}_result.json"])
    assert facts["status"] == "failed" and not facts["persisted"]
    assert "private-image-details" not in str(facts)
    process.assert_not_called()
