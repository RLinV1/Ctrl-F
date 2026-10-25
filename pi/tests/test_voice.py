from unittest.mock import Mock

import pytest

from voice import VoiceButton


def button():
    return VoiceButton("plughw:CARD=Webcam,DEV=0", Mock())


def test_duplicate_edges_cannot_start_overlapping_recordings(monkeypatch):
    thread = Mock()
    monkeypatch.setattr("voice.threading.Thread", thread)
    b = button()
    b.press()
    b.press()
    assert thread.call_count == 1
    b.release()
    assert b._released.is_set()


@pytest.mark.parametrize("duration,expected", [(0.2, False), (3.0, True)])
def test_short_and_normal_recordings(monkeypatch, tmp_path, duration, expected):
    b = button()
    process = Mock(returncode=0)
    process.poll.side_effect = [None, 0]
    monkeypatch.setattr("voice.subprocess.Popen", Mock(return_value=process))
    b._released.set()
    clock = iter([0, duration])
    monkeypatch.setattr("voice.time.monotonic", lambda: next(clock))
    encode = Mock(side_effect=lambda *args, **kw: (tmp_path / "request.ogg").write_bytes(b"OggS"))
    monkeypatch.setattr("voice.subprocess.run", encode)
    assert (b.record(tmp_path) == b"OggS") is expected
    assert bool(encode.call_count) is expected
    process.send_signal.assert_called_once()


def test_maximum_duration_stops_without_release(monkeypatch, tmp_path):
    b = button()
    process = Mock(returncode=0)
    process.poll.side_effect = [None, None, 0]
    monkeypatch.setattr("voice.subprocess.Popen", Mock(return_value=process))
    b._released.wait = Mock(return_value=False)
    clock = iter([0, 16, 16])
    monkeypatch.setattr("voice.time.monotonic", lambda: next(clock))
    monkeypatch.setattr("voice.subprocess.run", lambda *args, **kw: (tmp_path / "request.ogg").write_bytes(b"OggS"))
    assert b.record(tmp_path) == b"OggS"
    process.send_signal.assert_called_once()


def test_failure_releases_lock_and_does_not_submit(monkeypatch):
    b = button()
    b._lock.acquire()
    b.record = Mock(side_effect=FileNotFoundError("arecord"))
    submit = b.submit
    b._run()
    assert not b._lock.locked()
    submit.assert_not_called()


def test_success_queues_supported_audio_and_cleans_up(monkeypatch):
    from pathlib import Path
    b = button()
    b._lock.acquire()
    directories = []
    def record(directory):
        directories.append(directory)
        return b"OggS"
    b.record = record
    b._run()
    b.submit.assert_called_once_with(b"OggS")
    assert not Path(directories[0]).exists()


def test_unavailable_microphone_is_detected(monkeypatch, tmp_path):
    b = button()
    b._released.set()
    process = Mock(returncode=1)
    process.poll.return_value = 1
    monkeypatch.setattr("voice.subprocess.Popen", Mock(return_value=process))
    with pytest.raises(RuntimeError, match="stopped unexpectedly"):
        b.record(tmp_path)
