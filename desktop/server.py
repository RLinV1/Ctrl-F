#!/usr/bin/env python3
"""Poll private S3 photos, analyze with Hermes, persist sightings, publish results."""

import json
import logging
import os
import time
import uuid
from datetime import datetime
from pathlib import Path, PurePosixPath

from botocore.exceptions import ClientError
from dotenv import load_dotenv

from hermes import HermesClient, HermesConfig
from processing import process_photo
from speech import ElevenLabsSTT, prepare_question

log = logging.getLogger(__name__)


class Worker:
    def __init__(self, s3, bucket: str, agent, sessions, transcribe=None) -> None:
        self.s3, self.bucket, self.agent, self.sessions = s3, bucket, agent, sessions
        self.transcribe = transcribe
        self._retry_after: dict[str, float] = {}

    def get_json(self, key: str) -> dict | None:
        try:
            return json.loads(self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read())
        except ClientError as error:
            if error.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return None
            raise

    def has_result(self, key: str) -> bool:
        stem = Path(key).stem
        facts = self.get_json(f"results/{stem}_result.json")
        if not facts or facts.get("status") == "failed":
            return False
        try:
            self.s3.head_object(Bucket=self.bucket, Key=f"results/{stem}_result.jpg")
            return True
        except ClientError as error:
            if error.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    def process(self, key: str, upload_time: datetime) -> None:
        stem = f"results/{Path(key).stem}_result"
        try:
            request = self.get_json(str(PurePosixPath(key).with_suffix(".json"))) or {}
            taken_at = datetime.fromisoformat(request["captured_at"].replace("Z", "+00:00")) if request.get("captured_at") else upload_time
            image = self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()
            facts, annotated = process_photo(image, key, taken_at, request.get("targets", []), self.agent, self.sessions)
            self.s3.put_object(Bucket=self.bucket, Key=stem+".json", Body=json.dumps(facts).encode(), ContentType="application/json")
            self.s3.put_object(Bucket=self.bucket, Key=stem+".jpg", Body=annotated, ContentType="image/jpeg")
        except Exception:
            # Never publish exception details, credentials, or an unpersisted success.
            self.s3.put_object(Bucket=self.bucket, Key=stem+".json", Body=json.dumps({
                "version": 2, "status": "failed", "error": "Image processing or memory persistence failed. Please try again.",
                "detections": [], "matches": [], "target": None, "persisted": False,
            }).encode(), ContentType="application/json")
            log.warning("Photo processing failed; will retry on the next poll")

    def process_device(self, manifest: dict) -> None:
        image_key = manifest["image_key"]
        stem = f"results/{manifest['id']}_result"
        try:
            if self.transcribe is None:
                raise RuntimeError("Desktop speech transcription is not configured")
            audio = self.s3.get_object(Bucket=self.bucket, Key=manifest["audio_key"])["Body"].read(10 * 1024 * 1024 + 1)
            with self.sessions() as session:
                transcript, targets = prepare_question(session, uuid.UUID(manifest["id"]),
                    datetime.fromisoformat(manifest["created_at"]), audio, self.transcribe)
            image = self.s3.get_object(Bucket=self.bucket, Key=image_key)["Body"].read(20 * 1024 * 1024 + 1)
            if len(image) > 20 * 1024 * 1024:
                raise ValueError("Photo exceeds size limit")
            facts, annotated = process_photo(image, image_key, datetime.fromisoformat(manifest["captured_at"]),
                                             targets, self.agent, self.sessions)
            facts.update(source="device", created_at=manifest["created_at"], transcript=transcript, targets=targets)
            self.s3.put_object(Bucket=self.bucket, Key=stem+".json", Body=json.dumps(facts).encode(), ContentType="application/json")
            self.s3.put_object(Bucket=self.bucket, Key=stem+".jpg", Body=annotated, ContentType="image/jpeg")
        except Exception:
            self.s3.put_object(Bucket=self.bucket, Key=stem+".json", Body=json.dumps({
                "version": 2, "status": "failed", "source": "device", "created_at": manifest["created_at"],
                "error": "Voice transcription, image analysis, or memory persistence failed. Please try again.",
                "detections": [], "matches": [], "target": None, "persisted": False,
            }).encode(), ContentType="application/json")
            log.warning("Device voice request failed; will retry")

    def device_assets_ready(self, manifest: dict) -> bool:
        for field, maximum in (("audio_key", 10 * 1024 * 1024), ("image_key", 20 * 1024 * 1024)):
            try:
                metadata = self.s3.head_object(Bucket=self.bucket, Key=manifest[field])
            except ClientError as error:
                if error.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                    return False
                raise
            if not 0 < metadata.get("ContentLength", 0) <= maximum:
                return False
        return True

    def poll(self) -> None:
        for page in self.s3.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix="incoming/"):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.startswith("incoming/device/") and key.endswith(".ready.json"):
                    try:
                        manifest = validate_device_manifest(key, self.get_json(key))
                        image_key = manifest["image_key"]
                        if time.monotonic() >= self._retry_after.get(image_key, 0) and not self.has_result(image_key) and self.device_assets_ready(manifest):
                            self.process_device(manifest)
                            if not self.has_result(image_key):
                                self._retry_after[image_key] = time.monotonic() + 60
                    except Exception:
                        log.warning("Could not process device ready manifest; retrying later")
                    continue
                if key.endswith(".jpg") and not key.startswith("incoming/training/") and time.monotonic() >= self._retry_after.get(key, 0):
                    try:
                        if not self.has_result(key):
                            self.process(key, obj["LastModified"])
                            if not self.has_result(key):
                                self._retry_after[key] = time.monotonic() + 60
                            else:
                                self._retry_after.pop(key, None)
                    except Exception:
                        log.warning("Could not access a queued photo; retrying on the next poll")


def validate_device_manifest(key: str, value: object) -> dict:
    """Only exact UUID-scoped asset keys may be sent to the speech/vision providers."""
    if not isinstance(value, dict) or value.get("version") != 1 or value.get("source") != "device":
        raise ValueError("Invalid device manifest")
    identifier = str(uuid.UUID(value.get("id", "")))
    if value["id"] != identifier or key != f"incoming/device/{identifier}.ready.json":
        raise ValueError("Mismatched device request identity")
    if value.get("audio_key") != f"incoming/device/{identifier}.ogg" or value.get("image_key") != f"incoming/device/{identifier}.jpeg":
        raise ValueError("Invalid device asset keys")
    if value.get("audio_content_type") != "audio/ogg":
        raise ValueError("Invalid device audio type")
    for field in ("created_at", "captured_at"):
        timestamp = datetime.fromisoformat(value[field])
        if timestamp.tzinfo is None or timestamp.utcoffset() is None:
            raise ValueError("Device timestamp requires a timezone")
    return value


def main() -> None:
    import boto3
    from ctrlf_db.session import make_engine, make_session_factory

    load_dotenv(".ctrlf-server.env")
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config = HermesConfig.from_env(os.environ)
    if not os.environ.get("ELEVENLABS_API_KEY"):
        log.warning("ELEVENLABS_API_KEY is unset: S3 Pi voice requests cannot be transcribed")
    if not os.environ.get("DATABASE_URL"):
        raise SystemExit("DATABASE_URL is required for persistent object memory")
    s3 = boto3.client("s3", endpoint_url=os.environ.get("S3_ENDPOINT") or None,
                      region_name=os.environ.get("S3_REGION") or "us-east-1",
                      aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID"),
                      aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY"))
    worker = Worker(s3, os.environ["S3_BUCKET"], HermesClient(config), make_session_factory(make_engine()), ElevenLabsSTT(os.environ.get("ELEVENLABS_API_KEY", "")))
    while True:
        try:
            worker.poll()
        except Exception:
            log.warning("Could not poll storage; retrying")
        time.sleep(3)


if __name__ == "__main__":
    main()
