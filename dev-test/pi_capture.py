"""Run on the Raspberry Pi: poll s3://BUCKET/jobs/, take a photo per job, upload incoming/<id>.json (the job's items) and then incoming/<id>.jpg.

Needs: boto3 and python-dotenv (sudo apt install python3-boto3 python3-dotenv), fswebcam (sudo apt install fswebcam),
and ~/.ctrlf.env (or ./.env) with S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and optionally S3_REGION.
"""
import os
import subprocess
import tempfile
import time

from pathlib import Path

import boto3
from dotenv import load_dotenv

load_dotenv(Path.home() / ".ctrlf.env")
load_dotenv(".env")

BUCKET = os.environ.get("S3_BUCKET") or "ctrlf-snapshots"
s3 = boto3.client(
    "s3",
    endpoint_url=os.environ.get("S3_ENDPOINT") or None,
    region_name=os.environ.get("S3_REGION") or None,
    aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID") or None,
    aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY") or None,
)

while True:
    for obj in s3.list_objects_v2(Bucket=BUCKET, Prefix="jobs/").get("Contents", []):
        job = obj["Key"].removeprefix("jobs/").removesuffix(".json")
        request = s3.get_object(Bucket=BUCKET, Key=obj["Key"])["Body"].read()  # {"text": ..., "targets": [...]}
        s3.delete_object(Bucket=BUCKET, Key=obj["Key"])  # claim it first so a slow shot is not taken twice
        with tempfile.TemporaryDirectory() as tmp:
            shot = os.path.join(tmp, "shot.jpg")
            # rpicam-* only drives CSI cameras; the USB webcam is V4L2, so use fswebcam (-S 10 skips warm-up frames)
            subprocess.run(["fswebcam", "-r", "1280x720", "-S", "10", "--no-banner", shot], check=True)
            s3.put_object(Bucket=BUCKET, Key=f"incoming/{job}.json", Body=request)  # before the jpg, so the processor finds it
            s3.upload_file(shot, BUCKET, f"incoming/{job}.jpg")
        print(f"[pi] sent incoming/{job}.jpg", flush=True)
    time.sleep(1)
