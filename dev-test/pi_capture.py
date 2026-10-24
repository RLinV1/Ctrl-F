"""Run on the Raspberry Pi: take a photo for every S3 job (jobs/<id>.json) and for every press of the Grove button.

All the logic lives in pi/capture.py; this is the same as running `python3 pi/capture.py`.
Needs: boto3, python-dotenv and gpiozero (sudo apt install python3-boto3 python3-dotenv python3-gpiozero), fswebcam (sudo apt install fswebcam),
and ~/.ctrlf.env (or ./.env) with S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and optionally S3_REGION.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pi"))
from capture import main

main()
