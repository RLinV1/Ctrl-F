#!/usr/bin/env python3
"""Take one photo with a USB (UVC) webcam. Usage: python3 capture.py (prints the random file name)"""
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

import boto3
from dotenv import load_dotenv

# Absolute path so it also works under cron; real env vars still win.
load_dotenv(Path.home() / ".ctrlf.env")
load_dotenv(".env")

def capture(job_id: str | None = None, targets: list[str] | None = None) -> str:
    """With a job id the photo is named after the job and incoming/<id>.json (the items asked for) lands before the jpg."""
    path = f"{job_id or uuid.uuid4().hex[:8]}.jpg"
    if shutil.which("fswebcam") is None:
        sys.exit("fswebcam not found. Run: sudo apt install fswebcam")
    # rpicam-* only drives CSI cameras; USB webcams are V4L2, so use fswebcam.
    # -S 10: skip first frames so auto-exposure settles
    subprocess.run(
        ["fswebcam", "-r", "1280x720", "-S", "10", "--no-banner", path], check=True
    )
    if bucket := os.environ.get("S3_BUCKET"):
        # Empty S3_ENDPOINT = real AWS S3. Same env names as the rest of the repo.
        s3 = boto3.client(
            "s3",
            endpoint_url=os.environ.get("S3_ENDPOINT") or None,
            aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
            region_name=os.environ.get("S3_REGION", "us-east-1"),
        )
        if targets is not None:  # the desktop starts on the jpg, so the targets must already be there
            s3.put_object(Bucket=bucket, Key=f"incoming/{Path(path).stem}.json", Body=json.dumps({"targets": targets}).encode())
        s3.upload_file(path, bucket, f"incoming/{path}")
        print(f"uploaded s3://{bucket}/incoming/{path}")
    else:
        print("S3_BUCKET not set, skipping upload", file=sys.stderr)
    return path


if __name__ == "__main__":
    print(capture())
