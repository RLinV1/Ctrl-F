#!/usr/bin/env python3
"""Pi webcam relay. Hold the button for voice; --now captures a training photo."""

import json
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

log = logging.getLogger(__name__)


class PiRelay:
    def __init__(self, s3, bucket: str, spool_dir: Path | None = None) -> None:
        self.s3, self.bucket = s3, bucket
        self._camera = threading.Lock()
        self._spool_lock = threading.Lock()
        self.spool = spool_dir or Path.home() / ".local/state/ctrlf/requests"

    def capture(self, name: str | None = None, request: bytes | None = None, prefix: str = "incoming/training") -> str:
        name = name or uuid.uuid4().hex[:8]
        if "/" in name or "\\" in name or name in (".", ".."):
            raise ValueError("Invalid capture name")
        if shutil.which("fswebcam") is None:
            raise RuntimeError("fswebcam not found; install it on the Pi")
        with tempfile.TemporaryDirectory(prefix="ctrlf-photo-") as directory:
            path = Path(directory) / f"{name}.jpg"
            captured_at = self.capture_file(path)
            if request is not None:
                metadata = json.loads(request)
                metadata["captured_at"] = captured_at
                self.s3.put_object(Bucket=self.bucket, Key=f"{prefix}/{name}.json", Body=json.dumps(metadata).encode())
            self.s3.upload_file(str(path), self.bucket, f"{prefix}/{name}.jpg")
        return name

    def capture_file(self, path: Path) -> str:
        """Capture once, serialized with browser-triggered photos."""
        with self._camera:
            try:
                subprocess.run(["fswebcam", "-r", "1280x720", "-S", "10", "--no-banner", str(path)],
                               check=True, timeout=20)
                if not path.read_bytes().startswith(b"\xff\xd8"):
                    raise RuntimeError("Camera returned no JPEG")
            except Exception:
                path.unlink(missing_ok=True)
                raise
            return datetime.now(UTC).isoformat()

    def queue_voice(self, audio: bytes) -> str:
        """Save locally and take the release-time photo before any S3 network I/O."""
        if not audio.startswith(b"OggS") or len(audio) > 10 * 1024 * 1024:
            raise ValueError("Expected an Ogg recording of at most 10 MiB")
        with self._spool_lock:
            self.spool.mkdir(parents=True, exist_ok=True, mode=0o700)
            name = str(uuid.uuid4())
            directory = self.spool / name
            directory.mkdir(mode=0o700)
            (directory / "audio.ogg").write_bytes(audio)
            metadata = {"version": 1, "source": "device", "id": name,
                        "created_at": datetime.now(UTC).isoformat(), "captured_at": None,
                        "audio_key": f"incoming/device/{name}.ogg",
                        "image_key": f"incoming/device/{name}.jpeg", "audio_content_type": "audio/ogg"}
            (directory / "request.json").write_text(json.dumps(metadata))
            try:
                metadata["captured_at"] = self.capture_file(directory / "photo.jpeg")
                self._save_pending(directory, metadata)
            except Exception:
                log.warning("Voice saved locally; camera capture will retry")
            return name

    @staticmethod
    def _save_pending(directory: Path, metadata: dict) -> None:
        temporary = directory / "request.tmp"
        temporary.write_text(json.dumps(metadata))
        temporary.replace(directory / "request.json")

    def flush_voice(self) -> None:
        """Only the final manifest makes a request visible to the desktop/web."""
        with self._spool_lock:
            if not self.spool.exists():
                return
            for directory in sorted(self.spool.iterdir()):
                if not directory.is_dir() or directory.is_symlink():
                    continue
                try:
                    name = str(uuid.UUID(directory.name))
                    metadata = json.loads((directory / "request.json").read_text())
                    if metadata["id"] != name:
                        raise ValueError("Mismatched local request ID")
                    if not metadata.get("captured_at"):
                        metadata["captured_at"] = self.capture_file(directory / "photo.jpeg")
                        self._save_pending(directory, metadata)
                    self.s3.upload_file(str(directory / "audio.ogg"), self.bucket, f"incoming/device/{name}.ogg")
                    self.s3.upload_file(str(directory / "photo.jpeg"), self.bucket, f"incoming/device/{name}.jpeg")
                    self.s3.put_object(Bucket=self.bucket, Key=f"incoming/device/{name}.ready.json",
                                       Body=json.dumps(metadata).encode(), ContentType="application/json")
                    shutil.rmtree(directory)
                    log.info("Voice request %s uploaded", name)
                except Exception:
                    log.warning("Voice request remains queued locally; capture/upload will retry")

    def poll_once(self) -> None:
        for page in self.s3.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix="jobs/"):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not key.endswith(".json"):
                    continue
                name = key.removeprefix("jobs/").removesuffix(".json")
                # One Pi owns the queue in v1; IDs remain stable across requeue.
                request = self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()
                self.s3.delete_object(Bucket=self.bucket, Key=key)
                try:
                    self.capture(name, request, prefix="incoming")
                except Exception:
                    self.s3.put_object(Bucket=self.bucket, Key=key, Body=request)
                    log.warning("Camera capture failed; request requeued")


def main() -> None:
    import argparse
    import boto3

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--now", action="store_true", help="take one training photo, without voice")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_dotenv(Path.home() / ".ctrlf.env")
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    s3 = boto3.client("s3", endpoint_url=os.environ.get("S3_ENDPOINT") or None,
                      region_name=os.environ.get("S3_REGION") or "us-east-1",
                      aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID"),
                      aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY"))
    relay = PiRelay(s3, os.environ["S3_BUCKET"], Path(os.environ["PI_SPOOL_DIR"]) if os.environ.get("PI_SPOOL_DIR") else None)
    if args.now:
        relay.capture()
        return
    from gpiozero import Button
    from voice import VoiceButton

    voice = VoiceButton(os.environ.get("PI_AUDIO_DEVICE", ""), relay.queue_voice,
                        float(os.environ.get("PI_RECORD_MAX_SECONDS") or "15"))
    button = Button(int(os.environ.get("CAPTURE_BUTTON_PIN") or "5"), pull_up=False, bounce_time=0.05)
    button.when_pressed = voice.press
    button.when_released = voice.release
    while True:
        try:
            relay.flush_voice()
            relay.poll_once()
        except Exception:
            log.warning("Could not poll camera requests; retrying")
        time.sleep(1)


if __name__ == "__main__":
    main()
