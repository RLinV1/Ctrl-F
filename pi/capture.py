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
    def __init__(self, s3, bucket: str) -> None:
        self.s3, self.bucket = s3, bucket
        self._camera = threading.Lock()

    def capture(self, name: str | None = None, request: bytes | None = None, prefix: str = "incoming/training") -> str:
        name = name or uuid.uuid4().hex[:8]
        if "/" in name or "\\" in name or name in (".", ".."):
            raise ValueError("Invalid capture name")
        if shutil.which("fswebcam") is None:
            raise RuntimeError("fswebcam not found; install it on the Pi")
        with tempfile.TemporaryDirectory(prefix="ctrlf-photo-") as directory:
            path = Path(directory) / f"{name}.jpg"
            with self._camera:
                subprocess.run(["fswebcam", "-r", "1280x720", "-S", "10", "--no-banner", str(path)],
                               check=True, timeout=20)
                captured_at = datetime.now(UTC).isoformat()
            if request is not None:
                metadata = json.loads(request)
                metadata["captured_at"] = captured_at
                self.s3.put_object(Bucket=self.bucket, Key=f"{prefix}/{name}.json", Body=json.dumps(metadata).encode())
            self.s3.upload_file(str(path), self.bucket, f"{prefix}/{name}.jpg")
        return name

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
    load_dotenv(Path.home() / ".ctrlf.env")
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    s3 = boto3.client("s3", endpoint_url=os.environ.get("S3_ENDPOINT") or None,
                      region_name=os.environ.get("S3_REGION") or "us-east-1",
                      aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID"),
                      aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY"))
    relay = PiRelay(s3, os.environ["S3_BUCKET"])
    if args.now:
        relay.capture()
        return
    from gpiozero import Button
    from voice import VoiceButton

    voice = VoiceButton(os.environ.get("PI_AUDIO_DEVICE", ""), os.environ.get("WEB_BASE_URL", ""),
                        os.environ.get("PI_JOB_TOKEN", ""), float(os.environ.get("PI_RECORD_MAX_SECONDS") or "15"))
    button = Button(int(os.environ.get("CAPTURE_BUTTON_PIN") or "5"), pull_up=False, bounce_time=0.05)
    button.when_pressed = voice.press
    button.when_released = voice.release
    while True:
        try:
            relay.poll_once()
        except Exception:
            log.warning("Could not poll camera requests; retrying")
        time.sleep(1)


if __name__ == "__main__":
    main()
