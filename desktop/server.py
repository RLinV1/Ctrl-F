#!/usr/bin/env python3
"""Poll s3://BUCKET/incoming/, run YOLO on each new photo, write the annotated image to results/."""
import os
import tempfile
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from ultralytics import YOLO

load_dotenv()  # finds .env in this folder or a parent; real env vars still win
BUCKET = os.environ["S3_BUCKET"]
s3 = boto3.client(
    "s3",
    endpoint_url=os.environ.get("S3_ENDPOINT") or None,
    aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
    region_name=os.environ.get("S3_REGION") or "us-east-1",
)
# Stock COCO weights until the custom model exists (docs/TRAINING.md).
model = YOLO(os.environ.get("YOLO_WEIGHTS_PATH") or "yolov8n.pt")


def has_result(name: str) -> bool:
    try:
        s3.head_object(Bucket=BUCKET, Key=f"results/{name}")
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def process(key: str) -> None:
    name = Path(key).name
    with tempfile.TemporaryDirectory() as tmp:
        src, out = f"{tmp}/{name}", f"{tmp}/out.jpg"
        s3.download_file(BUCKET, key, src)
        result = model(src)[0]
        result.save(filename=out)
        s3.upload_file(out, BUCKET, f"results/{name}")
    print(name, [result.names[int(c)] for c in result.boxes.cls], flush=True)


def main() -> None:
    pages = s3.get_paginator("list_objects_v2")
    while True:
        for page in pages.paginate(Bucket=BUCKET, Prefix="incoming/"):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                # one bad file must not stop the loop
                try:
                    if key.endswith(".jpg") and not has_result(Path(key).name):
                        process(key)
                except Exception as e:
                    print(f"failed {key}: {e}", flush=True)
        time.sleep(3)


if __name__ == "__main__":
    main()
