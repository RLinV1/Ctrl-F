#!/usr/bin/env python3
"""Take a photo with a USB (UVC) webcam and upload it to s3://BUCKET/incoming/<name>.jpg.

Two triggers, one capture():
  python3 capture.py        runs both: the Grove button (records 5 s from the webcam mic, then takes the photo) (GPIO CAPTURE_BUTTON_PIN, default 5 = Grove Base Hat port D5)
                            and the S3 jobs queue (jobs/<id>.json, as dropped by the dev-test server)
  python3 capture.py --now  one photo right away
  dev-test/pi_capture.py    same as python3 capture.py
"""
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

import boto3
from dotenv import load_dotenv
from gpiozero import Button

# Absolute path so it also works under cron; real env vars still win.
load_dotenv(Path.home() / ".ctrlf.env")
load_dotenv(".env")

BUCKET = os.environ.get("S3_BUCKET") or "ctrlf-snapshots"
# Empty S3_ENDPOINT = real AWS S3. Same env names as the rest of the repo.
s3 = boto3.client(
    "s3",
    endpoint_url=os.environ.get("S3_ENDPOINT") or None,
    region_name=os.environ.get("S3_REGION") or None,
    aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID") or None,
    aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY") or None,
)
RECORD_SECONDS = 5
_camera = threading.Lock()  # the button thread and the job poller share one webcam
_listening = threading.Lock()  # a press while recording is ignored


def capture(name: str | None = None, request: bytes | None = None, audio: Path | None = None) -> str:
    """Shoot, then upload incoming/<name>.jpg (after incoming/<name>.json / .wav when given, so the processor finds them first)."""
    name = name or uuid.uuid4().hex[:8]
    if shutil.which("fswebcam") is None:
        sys.exit("fswebcam not found. Run: sudo apt install fswebcam")
    path = Path(f"{name}.jpg")
    try:
        with _camera:
            # rpicam-* only drives CSI cameras; USB webcams are V4L2, so use fswebcam.
            # -S 10: skip first frames so auto-exposure settles
            subprocess.run(["fswebcam", "-r", "1280x720", "-S", "10", "--no-banner", str(path)], check=True)
        if request is not None:
            s3.put_object(Bucket=BUCKET, Key=f"incoming/{name}.json", Body=request)
        if audio is not None:
            s3.upload_file(str(audio), BUCKET, f"incoming/{name}.wav")
        s3.upload_file(str(path), BUCKET, f"incoming/{name}.jpg")
    finally:
        path.unlink(missing_ok=True)
    print(f"uploaded s3://{BUCKET}/incoming/{name}.jpg", flush=True)
    return name


def listen_then_capture() -> None:
    """Button press: record RECORD_SECONDS from the webcam mic, then take the photo."""
    if shutil.which("arecord") is None:
        sys.exit("arecord not found. Run: sudo apt install alsa-utils")
    if not _listening.acquire(blocking=False):
        return
    name = uuid.uuid4().hex[:8]
    wav = Path(f"{name}.wav")
    try:
        # AUDIO_DEVICE picks the webcam mic, e.g. plughw:1,0 (find it with `arecord -l`); empty = the default device.
        device = ["-D", os.environ["AUDIO_DEVICE"]] if os.environ.get("AUDIO_DEVICE") else []
        subprocess.run(["arecord", *device, "-f", "S16_LE", "-r", "16000", "-c", "1", "-d", str(RECORD_SECONDS), str(wav)], check=True)
        capture(name, audio=wav)
    finally:
        wav.unlink(missing_ok=True)
        _listening.release()


def watch_button() -> Button:
    """Take a photo on every press. Keep the returned Button alive."""
    # Grove button drives SIG high when pressed, so pull_up=False (not the usual button-to-GND). bounce_time ignores contact chatter.
    button = Button(int(os.environ.get("CAPTURE_BUTTON_PIN", 5)), pull_up=False, bounce_time=0.05)
    button.when_pressed = listen_then_capture
    return button


def poll_jobs() -> None:
    """Take a photo for every jobs/<id>.json in the bucket. Never returns."""
    while True:
        for obj in s3.list_objects_v2(Bucket=BUCKET, Prefix="jobs/").get("Contents", []):
            job = obj["Key"].removeprefix("jobs/").removesuffix(".json")
            request = s3.get_object(Bucket=BUCKET, Key=obj["Key"])["Body"].read()  # {"text": ..., "targets": [...]}
            s3.delete_object(Bucket=BUCKET, Key=obj["Key"])  # claim it first so a slow shot is not taken twice
            capture(job, request)
        time.sleep(1)


def main() -> None:
    if "--now" in sys.argv:
        capture()
        return
    button = watch_button()  # noqa: F841  must stay referenced or gpiozero closes the pin
    poll_jobs()


if __name__ == "__main__":
    main()
