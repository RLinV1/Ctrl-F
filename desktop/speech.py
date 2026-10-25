"""ElevenLabs transcription for S3-only Pi voice requests."""

from collections.abc import Mapping, Sequence

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from ctrlf_db.models import Item, Job


class TranscriptionError(RuntimeError):
    """Safe diagnostic; provider bodies and credentials are never exposed."""


class ElevenLabsSTT:
    def __init__(self, api_key: str, *, transport: httpx.BaseTransport | None = None) -> None:
        self.api_key = api_key
        self.transport = transport

    def __call__(self, audio: bytes) -> str:
        if not self.api_key:
            raise TranscriptionError("Desktop ELEVENLABS_API_KEY is required for Pi audio")
        if not audio.startswith(b"OggS") or len(audio) > 10 * 1024 * 1024:
            raise TranscriptionError("Invalid Pi Ogg recording")
        try:
            with httpx.Client(transport=self.transport, follow_redirects=False, timeout=60) as client:
                response = client.post("https://api.elevenlabs.io/v1/speech-to-text",
                    headers={"xi-api-key": self.api_key}, data={"model_id": "scribe_v1"},
                    files={"file": ("recording.ogg", audio, "audio/ogg")})
                if response.status_code != 200:
                    raise TranscriptionError(f"Speech transcription returned HTTP {response.status_code}")
                text = response.json().get("text")
                if not isinstance(text, str) or len(text) > 10_000:
                    raise TranscriptionError("Invalid speech transcript")
                return text.strip()
        except (httpx.HTTPError, ValueError, AttributeError):
            raise TranscriptionError("Speech transcription could not complete") from None


def match_targets(transcript: str, catalog: Mapping[str, Sequence[str]]) -> list[str]:
    """Keep arbitrary phrases while resolving existing exact names and aliases."""
    from targets import extract_targets
    return extract_targets(transcript, catalog)


def prepare_question(session, identifier, created_at, audio: bytes, transcribe) -> tuple[str, list[str]]:
    """Persist transcription before analysis so publication retries do not bill STT again."""
    job = session.get(Job, identifier)
    if job is not None and job.transcript is not None:
        return job.transcript, list(job.targets)
    transcript = transcribe(audio)
    items = session.scalars(select(Item)).all()
    targets = match_targets(transcript, {item.name: list(item.aliases) for item in items})
    session.execute(insert(Job).values(id=identifier, status="claimed", created_at=created_at,
                                      transcript=transcript, targets=targets).on_conflict_do_update(
        index_elements=[Job.id], set_={"transcript": transcript, "targets": targets},
        where=Job.transcript.is_(None) & Job.finished_at.is_(None)))
    session.commit()
    return transcript, targets
