#!/usr/bin/env python3
"""Poll the web app for a job, take a photo for it, upload it. The desktop server picks the photo up from S3.

Needs WEB_BASE_URL and PI_JOB_TOKEN (and the S3_* keys capture.py uses) in ~/.ctrlf.env or the environment.
"""
import os
import time

import requests
from capture import capture

WEB = os.environ.get("WEB_BASE_URL", "http://localhost:3000").rstrip("/")


def main() -> None:
    headers = {"authorization": f"Bearer {os.environ['PI_JOB_TOKEN']}"}
    while True:
        try:
            r = requests.get(f"{WEB}/api/jobs/next", headers=headers, timeout=10)
            if r.status_code == 200:
                job = r.json()
                print("job", job["id"], capture(job["id"], job.get("targets", [])), flush=True)
        except Exception as e:  # keep polling through camera or network hiccups
            print(f"agent: {e}", flush=True)
        time.sleep(1)


if __name__ == "__main__":
    main()
