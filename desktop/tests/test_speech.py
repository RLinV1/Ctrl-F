import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import httpx
import pytest

from speech import ElevenLabsSTT, TranscriptionError, match_targets, prepare_question


def test_transcription_uses_existing_elevenlabs_pipeline():
    def handler(request):
        assert str(request.url) == "https://api.elevenlabs.io/v1/speech-to-text"
        assert request.headers["xi-api-key"] == "secret-token"
        assert b"scribe_v1" in request.content and b"recording.ogg" in request.content
        return httpx.Response(200, json={"text":" Where are my keys? "})
    assert ElevenLabsSTT("secret-token", transport=httpx.MockTransport(handler))(b"OggS-data") == "Where are my keys?"


@pytest.mark.parametrize("status", [302, 401, 429, 503])
def test_stt_failure_redacts_provider_body(status):
    client = ElevenLabsSTT("secret-token", transport=httpx.MockTransport(lambda request: httpx.Response(status,text="secret-token")))
    with pytest.raises(TranscriptionError) as exc:
        client(b"OggS-data")
    assert "secret-token" not in str(exc.value)


def test_missing_key_and_invalid_audio_do_not_contact_provider():
    with pytest.raises(TranscriptionError, match="ELEVENLABS_API_KEY"):
        ElevenLabsSTT("")(b"OggS-data")
    with pytest.raises(TranscriptionError, match="Invalid Pi"):
        ElevenLabsSTT("key")(b"not-ogg")


def test_matching_aliases_boundaries_and_overlapping_names():
    catalog = {"keys":["keyring"], "phone":[], "headphones":[], "airpods":[], "airpods case":[]}
    assert match_targets("Where is my keyring and my phone?", catalog) == ["keys","phone"]
    assert match_targets("headphones and airpods case", catalog) == ["headphones","airpods case"]
    assert match_targets("hello there", catalog) == []


def test_persisted_transcript_reused_without_new_paid_call():
    session = MagicMock()
    session.get.return_value = SimpleNamespace(transcript="Where are my keys?", targets=["keys"])
    transcribe = MagicMock()
    assert prepare_question(session, uuid4(), datetime.now(UTC), b"OggS", transcribe) == ("Where are my keys?",["keys"])
    transcribe.assert_not_called()


def test_new_transcript_persisted_before_analysis():
    session = MagicMock()
    session.get.return_value = None
    session.scalars.return_value.all.return_value = [SimpleNamespace(name="keys",aliases=["keyring"])]
    transcribe = MagicMock(return_value="Where is the keyring?")
    assert prepare_question(session, uuid4(), datetime.now(UTC), b"OggS", transcribe) == ("Where is the keyring?",["keys"])
    session.execute.assert_called_once()
    session.commit.assert_called_once()


def test_failed_stt_does_not_commit_a_verdict():
    session = MagicMock()
    session.get.return_value = None
    with pytest.raises(TranscriptionError):
        prepare_question(session,uuid4(),datetime.now(UTC),b"OggS",MagicMock(side_effect=TranscriptionError("failed")))
    session.execute.assert_not_called()
    session.commit.assert_not_called()


@pytest.mark.parametrize("case", json.loads((Path(__file__).parent / "fixtures/target-phrases.json").read_text()))
def test_arbitrary_target_phrases(case):
    catalog = {"keys": ["keyring"], "phone": [], "headphones": [], "airpods case": []}
    assert match_targets(case["text"], catalog) == case["targets"]
