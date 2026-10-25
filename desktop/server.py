#!/usr/bin/env python3
"""Poll s3://BUCKET/incoming/, run YOLO on each new photo, write results/<id>_result.json (what was found) and then the annotated
results/<id>_result.jpg. The laptop narrates the json, so the json must land before the jpg.
When DATABASE_URL is set, each photo and its detections are also stored in Postgres (ctrlf_db)."""
import json
import os
import tempfile
import time
from datetime import datetime
from pathlib import Path, PurePosixPath

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from ultralytics import YOLO

# Relative to the folder you run from; real env vars and earlier files win.
load_dotenv(".ctrlf-server.env")
load_dotenv()  # then .env in this folder or a parent
BUCKET = os.environ["S3_BUCKET"]
s3 = boto3.client(
    "s3",
    endpoint_url=os.environ.get("S3_ENDPOINT") or None,
    aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
    region_name=os.environ.get("S3_REGION") or "us-east-1",
)
# Stock COCO weights until the custom model exists (docs/TRAINING.md).
WEIGHTS = os.environ.get("YOLO_WEIGHTS_PATH") or "yolov8n.pt"
model = YOLO(WEIGHTS)

# Optional: without DATABASE_URL the server only writes S3, as before.
db = None
if os.environ.get("DATABASE_URL"):
    from ctrlf_db import repo
    from ctrlf_db.session import make_engine, make_session_factory

    db = make_session_factory(make_engine())


def result_name(key: str) -> str:
    return f"{Path(key).stem}_result.jpg"  # incoming/abc.jpg -> results/abc_result.jpg


def has_result(key: str) -> bool:
    try:
        s3.head_object(Bucket=BUCKET, Key=f"results/{result_name(key)}")
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
            return False
        raise


def requested_items(key: str) -> list[str]:
    """The items the user asked for, from incoming/<id>.json (written by the Pi from the laptop's job). Empty when absent."""
    try:
        # PurePosixPath: S3 keys use "/" even on Windows, where Path would write "incoming\<id>.json".
        body = s3.get_object(Bucket=BUCKET, Key=f"{PurePosixPath(key).with_suffix('')}.json")["Body"].read()
        return json.loads(body).get("targets", [])
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
            return []
        raise


def findings(targets: list[str], detections: list[dict], known: list[str]) -> dict:
    """The facts the narrator words. Matching is by exact class name, so the model's classes must match the target names."""
    items = []
    for t in targets:
        matches = sorted((d for d in detections if d["name"] == t), key=lambda d: -d["conf"])
        items.append({"item": t, "status": "found" if matches else "not_visible", "matches": matches})
    if not targets:
        return {"status": "no_target", "target": None, "matches": [], "known": known, "detections": detections}
    first = next((i for i in items if i["matches"]), items[0])
    return {"status": "found" if first["matches"] else "not_visible", "target": first["item"], "matches": first["matches"],
            "items": items, "detections": detections}


def store(key: str, taken_at: datetime, width: int, height: int, targets: list[str], detections: list[dict],
          annotated_key: str) -> None:
    """Save the photo, its detections and each item's last location. A database error never stops the S3 flow."""
    try:
        with db() as session:
            repo.save_result(session, s3_key=key, annotated_key=annotated_key, taken_at=taken_at, width=width,
                             height=height, model_version=Path(WEIGHTS).name, targets=targets,
                             boxes=[repo.box_from_yolo(d) for d in detections], job_id=repo.job_id_from_key(key))
    except Exception as e:
        print(f"db write failed for {key}: {e}", flush=True)


def process(key: str, taken_at: datetime) -> None:
    """`taken_at` is the photo's upload time in S3 until the Pi sends its own capture time."""
    name = Path(key).name
    with tempfile.TemporaryDirectory() as tmp:
        src, out = f"{tmp}/{name}", f"{tmp}/out.jpg"
        s3.download_file(BUCKET, key, src)
        result = model(src)[0]
        result.save(filename=out)
        detections = [{"name": result.names[int(c)], "conf": round(float(s), 3), "box": [round(v, 4) for v in b]}
                      for c, s, b in zip(result.boxes.cls.tolist(), result.boxes.conf.tolist(), result.boxes.xyxyn.tolist())]
        targets = requested_items(key)
        facts = findings(targets, detections, list(result.names.values()))
        stem = f"results/{Path(key).stem}_result"
        s3.put_object(Bucket=BUCKET, Key=f"{stem}.json", Body=json.dumps(facts).encode())  # before the jpg: the jpg means "done"
        s3.upload_file(out, BUCKET, f"{stem}.jpg")
    if db is not None:
        height, width = result.orig_shape
        store(key, taken_at, width, height, targets, detections, f"{stem}.jpg")
    print(name, [result.names[int(c)] for c in result.boxes.cls], flush=True)


def main() -> None:
    pages = s3.get_paginator("list_objects_v2")
    while True:
        for page in pages.paginate(Bucket=BUCKET, Prefix="incoming/"):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                # one bad file must not stop the loop
                try:
                    if key.endswith(".jpg") and not key.startswith("incoming/training/") and not has_result(key):
                        process(key)
                except Exception as e:
                    print(f"failed {key}: {e}", flush=True)
        time.sleep(3)


if __name__ == "__main__":
    main()
