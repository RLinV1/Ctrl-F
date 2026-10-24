"""Throwaway dev server for the dev-test UI. Delete the whole dev-test/ folder when the real web app lands.

    python dev-test/server.py        # API on http://localhost:8000
    cd dev-test/ui-react && npm run dev   # React UI on http://localhost:5173, proxies /api here

Proxies ElevenLabs and saves training photos so the API key stays on this machine.
Listens on localhost only. Needs: pip install requests
"""
import csv
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
import yaml
from find import describe, extract_target, match
from narrator import MODEL, narrate
from PIL import Image

from stt_test import transcribe
from tts_test import DEFAULT_VOICE, load_env, synthesize

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPORT = HERE / "out" / "report.json"
PORT = 8000


DATASET = ROOT / "datasets" / "personal"
SPLITS = ("train", "val", "test")
REVIEW = DATASET / "review.json"  # {"train/abc.jpg": true|false}: the user's yes/no on each image
WEIGHTS = Path(os.environ.get("YOLO_WEIGHTS_PATH") or ROOT / "runs" / "small-items" / "weights" / "best.pt")
CONFIDENCE = 0.25
_model = None
_model_mtime = 0.0
_model_lock = threading.Lock()


def get_model():
    """Load the trained weights, reloading when training writes a better best.pt."""
    global _model, _model_mtime
    if not WEIGHTS.exists():
        raise FileNotFoundError(f"No trained model at {WEIGHTS} yet. Is training still starting up?")
    if _model is None or WEIGHTS.stat().st_mtime != _model_mtime:
        from ultralytics import YOLO  # imported late: slow, and not needed for the other endpoints

        _model_mtime = WEIGHTS.stat().st_mtime
        _model = YOLO(str(WEIGHTS))
    return _model


def find(jpeg: bytes, transcript: str) -> dict:
    """Run the model on the photo, then look for the item named in the transcript among its detections."""
    started = time.perf_counter()
    with _model_lock:
        model = get_model()
        result = model.predict(Image.open(BytesIO(jpeg)).convert("RGB"), conf=CONFIDENCE, device="cpu", verbose=False)[0]
        known = list(model.names.values())
    detections = [{"cls": int(c), "name": known[int(c)], "conf": round(float(s), 3), "box": [round(v, 4) for v in b]}
                  for c, s, b in zip(result.boxes.cls.tolist(), result.boxes.conf.tolist(), result.boxes.xyxyn.tolist())]
    target, supported = extract_target(transcript, known)
    matches = match(target, detections) if supported else []
    status, message = describe(target, supported, matches, known)
    return {"transcript": transcript, "target": target, "status": status, "message": message, "matches": matches,
            "known": known, "detections": detections, "model": WEIGHTS.name, "seconds": round(time.perf_counter() - started, 2)}


def narration_for(result: dict) -> str | None:
    """Gemini's Sherlock wording of a result, or None when there is no key or Gemini fails."""
    if not os.environ.get("GEMINI_API_KEY"):
        return None
    try:
        return narrate(result, os.environ["GEMINI_API_KEY"], os.environ.get("GEMINI_MODEL") or MODEL)
    except (SystemExit, requests.RequestException, KeyError, IndexError) as error:
        print(f"[narrator] {error}", flush=True)
        return None


def dataset_listing() -> dict:
    """Every labeled appliance image with its boxes (normalized x1,y1,x2,y2) and photo credit."""
    classes = list(yaml.safe_load((ROOT / "training" / "personal.yaml").read_text())["names"].values())
    credit = {}
    attribution = DATASET / "ATTRIBUTION.csv"
    if attribution.exists():
        with open(attribution, newline="", encoding="utf-8") as f:
            credit = {row["image_id"]: row for row in csv.DictReader(f)}
    splits = {}
    for split in SPLITS:
        items = []
        for image in sorted((DATASET / "images" / split).glob("*.jpg")):
            boxes = []
            label_file = DATASET / "labels" / split / f"{image.stem}.txt"
            for line in label_file.read_text().splitlines() if label_file.exists() else []:
                cls, cx, cy, w, h = line.split()
                cx, cy, w, h = float(cx), float(cy), float(w), float(h)
                boxes.append({"cls": int(cls), "name": classes[int(cls)], "box": [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]})
            who = credit.get(image.stem, {})
            items.append({"file": image.name, "boxes": boxes, "author": who.get("author", ""),
                          "source": who.get("source", ""), "license": who.get("license", "")})
        splits[split] = items
    return {"classes": classes, "splits": splits, "review": json.loads(REVIEW.read_text()) if REVIEW.exists() else {}}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: dict) -> None:
        self._send(status, json.dumps(payload).encode(), "application/json")

    def _body(self) -> bytes:
        return self.rfile.read(int(self.headers.get("Content-Length", 0)))

    def do_GET(self) -> None:
        url = urlparse(self.path)
        if url.path == "/":  # people open this port by mistake; send them to the UI
            self.send_response(302)
            self.send_header("Location", "http://localhost:5173")
            self.end_headers()
            return
        if url.path == "/api/dataset":
            if not DATASET.exists():
                return self._json(404, {"error": "No dataset yet. Run training/prepare_openimages.py first."})
            return self._json(200, dataset_listing())
        if url.path == "/api/dataimage":
            query = parse_qs(url.query)
            split, name = query.get("split", [""])[0], Path(query.get("name", [""])[0]).name  # .name blocks path traversal
            image = DATASET / "images" / split / name
            if split not in SPLITS or not name or not image.is_file():
                return self._json(404, {"error": "image not found"})
            return self._send(200, image.read_bytes(), "image/jpeg")
        if url.path == "/api/report":  # written by training/report.py
            if not REPORT.exists():
                return self._json(404, {"error": "No report yet. Run training/report.py first."})
            return self._send(200, REPORT.read_bytes(), "application/json")
        if url.path == "/api/image":  # a dataset image named in the report
            name = Path(parse_qs(url.query).get("name", [""])[0]).name  # .name blocks path traversal
            folder = ROOT / json.loads(REPORT.read_text())["image_dir"] if REPORT.exists() else None
            if not name or folder is None or not (folder / name).is_file():
                return self._json(404, {"error": "image not found"})
            return self._send(200, (folder / name).read_bytes(), "image/jpeg")
        self._json(404, {"error": "API only. Open the React UI at http://localhost:5173"})

    def do_POST(self) -> None:
        url = urlparse(self.path)
        api_key = os.environ["ELEVENLABS_API_KEY"]
        voice = os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE
        try:
            if url.path == "/api/tts":
                text = json.loads(self._body())["text"]
                self._send(200, synthesize(text, voice, api_key), "audio/mpeg")
            elif url.path == "/api/stt":
                audio = self._body()
                extension = "mp3" if "mpeg" in self.headers.get("Content-Type", "") else "webm"
                print(f"[stt] {len(audio)} bytes, {self.headers.get('Content-Type')}", flush=True)
                if not audio:
                    return self._json(400, {"error": "empty audio"})
                started = time.perf_counter()
                text = transcribe(audio, f"clip.{extension}", api_key)
                print(f"[stt] heard: {text!r}", flush=True)
                self._json(200, {"text": text, "seconds": round(time.perf_counter() - started, 1)})
            elif url.path == "/api/review":  # body = {"key": "train/abc.jpg", "keep": true|false|null}
                body = json.loads(self._body())
                review = json.loads(REVIEW.read_text()) if REVIEW.exists() else {}
                if body["keep"] is None:
                    review.pop(body["key"], None)
                else:
                    review[body["key"]] = bool(body["keep"])
                REVIEW.write_text(json.dumps(review))
                self._json(200, {"ok": True})
            elif url.path == "/api/find":  # body = JPEG photo, ?text = what the user said
                result = find(self._body(), parse_qs(url.query).get("text", [""])[0])
                result["narration"] = narration_for(result)  # None -> the UI falls back to the plain "message"
                self._json(200, result)
            elif url.path == "/api/trouble":  # body = {"problem": "..."}; Sherlock explains instead of the UI showing an error
                problem = json.loads(self._body())["problem"]
                print(f"[trouble] {problem}", flush=True)
                self._json(200, {"narration": narration_for({"status": "trouble", "target": None, "matches": [], "problem": problem})})
            else:
                self._json(404, {"error": "not found"})
        except FileNotFoundError as error:  # no trained weights yet
            self._json(503, {"error": str(error)})
        except SystemExit as error:  # transcribe/synthesize exit with the upstream error message
            print(f"[error] {error}", flush=True)
            self._json(502, {"error": str(error)})
        except (KeyError, ValueError) as error:
            self._json(400, {"error": f"bad request: {error}"})


def main() -> None:
    load_env()
    if not os.environ.get("ELEVENLABS_API_KEY"):
        sys.exit("ELEVENLABS_API_KEY is not set. Put it in .env (see .env.example).")
    print(f"Dev UI on http://localhost:{PORT}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
