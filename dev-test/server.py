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
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
import yaml
from photo import crop_box, rotate_box
from find import describe_all, extract_targets, merge_detections
from narrator import MODEL, narrate, pick_targets
from PIL import Image, ImageOps

from stt_test import transcribe
from tts_test import DEFAULT_VOICE, load_env, synthesize

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "training"))
from classes import CLASSES  # noqa: E402  the labeler offers the same classes the model is trained on
REPORT = HERE / "out" / "report.json"


def s3_client():
    """S3 client from the S3_* keys in .env, so nobody needs the AWS CLI or ~/.aws set up."""
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT") or None,
        region_name=os.environ.get("S3_REGION") or None,
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID") or None,
        aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY") or None,
    )


def s3_bucket() -> str:
    return os.environ.get("S3_BUCKET") or "ctrlf-snapshots"
PORT = 8000


DATASET = ROOT / "training" / "datasets" / "personal"
SPLITS = ("train", "val", "test")
WEIGHTS = Path(os.environ.get("YOLO_WEIGHTS_PATH") or ROOT / "runs" / "small-items-4" / "weights" / "best.pt").resolve()
CONFIDENCE = 0.25
_model = None
_model_key = None  # (path, mtime) of the loaded model
_model_lock = threading.Lock()


def get_model():
    """Load the trained weights, reloading when training writes a better best.pt."""
    global _model, _model_key
    if not WEIGHTS.exists():
        raise FileNotFoundError(f"No trained model at {WEIGHTS} yet. Is training still starting up?")
    if _model is None or (WEIGHTS, WEIGHTS.stat().st_mtime) != _model_key:
        from ultralytics import YOLO  # imported late: slow, and not needed for the other endpoints

        _model_key = (WEIGHTS, WEIGHTS.stat().st_mtime)
        _model = YOLO(str(WEIGHTS))
    return _model


STOCK = ROOT / "weights" / "yolo26n.pt"  # stock COCO weights: chairs, tables, laptops, cell phones, ...
_stock = None


def get_stock():
    """The stock COCO model, or None when its weights are not on disk (then only the trained model runs)."""
    global _stock
    if _stock is None and STOCK.exists():
        from ultralytics import YOLO

        _stock = YOLO(str(STOCK))
    return _stock


def detect(model, image: Image.Image) -> list[dict]:
    result = model.predict(image, conf=CONFIDENCE, device="cpu", verbose=False)[0]
    names = model.names
    return [{"cls": int(c), "name": names[int(c)], "conf": round(float(s), 3), "box": [round(v, 4) for v in b]}
            for c, s, b in zip(result.boxes.cls.tolist(), result.boxes.conf.tolist(), result.boxes.xyxyn.tolist())]


def warm_up() -> None:
    """Load the selected model and run one blank frame through it, so the first real photo is fast. Runs in a thread."""
    try:
        with _model_lock:
            blank = Image.new("RGB", (640, 480))
            get_model().predict(blank, device="cpu", verbose=False)
            if get_stock():
                get_stock().predict(blank, device="cpu", verbose=False)
        print(f"[model] {WEIGHTS.name} ready", flush=True)
    except Exception as error:  # no weights yet, etc.: the first /api/find reports it
        print(f"[model] warm-up skipped: {error}", flush=True)


def model_listing() -> dict:
    """Weights files on this machine, smallest first, and the one in use. Names are paths relative to the repo root."""
    files = {f.resolve() for f in (*ROOT.glob("*.pt"), *(ROOT / "weights").glob("*.pt"), *ROOT.glob("runs/*/weights/best.pt"), WEIGHTS)}
    models = [{"name": f.relative_to(ROOT).as_posix() if f.is_relative_to(ROOT) else str(f), "mb": round(f.stat().st_size / 1e6, 1)}
              for f in files if f.exists()]
    return {"models": sorted(models, key=lambda m: m["mb"]),
            "selected": WEIGHTS.relative_to(ROOT).as_posix() if WEIGHTS.is_relative_to(ROOT) else str(WEIGHTS)}


def find(jpeg: bytes, transcript: str) -> dict:
    """Run the model on the photo, then look for the item named in the transcript among its detections."""
    started = time.perf_counter()
    with _model_lock:
        model, stock = get_model(), get_stock()
        image = Image.open(BytesIO(jpeg)).convert("RGB")
        own, own_names = detect(model, image), list(model.names.values())
        coco = detect(stock, image) if stock and stock.names != model.names else []  # skip when the stock model is the selected one
        known = own_names  # what we can be asked for; the stock classes only add context and "phone"
    detections = merge_detections(own, coco, own_names)
    targets = extract_targets(transcript, known)  # everything asked for: "my keys and wallet" is two items
    answer = describe_all(targets, detections, known)
    return {"transcript": transcript, "target": targets[0][0] if targets else None, "targets": [t[0] for t in targets],
            "status": answer["status"], "message": answer["message"], "matches": answer["matches"], "items": answer["items"],
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


MINE = ROOT / "training" / "datasets" / "mine"  # our own photos: images/<id>.jpg and labels/<id>.txt (YOLO format)
MAX_SIDE = 1280  # uploads are shrunk to this, like the other training images


def own_listing() -> dict:
    """Every uploaded photo with its boxes. A label file, even an empty one, means the photo is labeled."""
    items = []
    for image in sorted((MINE / "images").glob("*.jpg")):
        label = MINE / "labels" / f"{image.stem}.txt"
        boxes = []
        for line in label.read_text().splitlines() if label.exists() else []:
            if not line.strip():
                continue  # blank line
            c, cx, cy, w, h = line.split()
            cx, cy, w, h = float(cx), float(cy), float(w), float(h)
            boxes.append({"cls": int(c), "name": CLASSES[int(c)], "box": [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]})
        items.append({"file": image.name, "labeled": label.exists(), "boxes": boxes})
    return {"classes": CLASSES, "items": items}


def own_image(name: str) -> Path | None:
    path = MINE / "images" / Path(name).name  # .name blocks path traversal
    return path if path.is_file() else None


def edit_photo(name: str, op: str, boxes: list[dict], arg) -> list[dict]:
    """Rotate (arg = 90 or -90 degrees clockwise) or crop (arg = [x1, y1, x2, y2] normalized) a photo in place.

    boxes are the boxes on screen, [{"cls", "box"}]; they move with the photo and are returned. They are written to the
    label file only when the photo was already labeled, so an edit never marks a photo as labeled.
    """
    path = own_image(name)
    if path is None:
        raise ValueError("unknown image")
    image = Image.open(path).convert("RGB")
    if op == "rotate":
        if arg not in (90, -90):
            raise ValueError("rotate by 90 or -90")
        image = image.rotate(-arg, expand=True)  # PIL turns counter-clockwise for positive angles
        moved = [{"cls": b["cls"], "box": rotate_box(b["box"], arg)} for b in boxes]
    elif op == "crop":
        x1, y1, x2, y2 = (min(max(float(v), 0.0), 1.0) for v in arg)
        if x2 - x1 < 0.02 or y2 - y1 < 0.02:
            raise ValueError("crop area is too small")
        w, h = image.size
        image = image.crop((round(x1 * w), round(y1 * h), round(x2 * w), round(y2 * h)))
        moved = [{"cls": b["cls"], "box": box} for b in boxes if (box := crop_box(b["box"], [x1, y1, x2, y2]))]
    else:
        raise ValueError("unknown edit")
    image.save(path, quality=90)
    if (MINE / "labels" / f"{path.stem}.txt").exists():
        save_labels(name, moved)
    return moved


def save_upload(data: bytes) -> str:
    """Store an uploaded photo as a shrunk JPEG under a fresh id. Raises ValueError when it is not an image."""
    try:
        image = ImageOps.exif_transpose(Image.open(BytesIO(data))).convert("RGB")
    except Exception as error:
        raise ValueError(f"not an image: {error}") from error
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    (MINE / "images").mkdir(parents=True, exist_ok=True)
    name = f"mine_{uuid.uuid4().hex[:12]}.jpg"
    image.save(MINE / "images" / name, quality=90)
    return name


def save_labels(name: str, boxes: list[dict]) -> None:
    """boxes: [{"cls": int, "box": [x1, y1, x2, y2]}] normalized. An empty list marks a photo with none of our items."""
    if own_image(name) is None:
        raise ValueError("unknown image")
    lines = []
    for b in boxes:
        x1, y1, x2, y2 = (min(max(float(v), 0.0), 1.0) for v in b["box"])
        x1, x2, y1, y2 = min(x1, x2), max(x1, x2), min(y1, y2), max(y1, y2)
        if not 0 <= int(b["cls"]) < len(CLASSES) or (x2 - x1) < 0.005 or (y2 - y1) < 0.005:
            continue  # unknown class or a stray click
        lines.append(f"{int(b['cls'])} {(x1 + x2) / 2:.6f} {(y1 + y2) / 2:.6f} {x2 - x1:.6f} {y2 - y1:.6f}")
    (MINE / "labels").mkdir(parents=True, exist_ok=True)
    (MINE / "labels" / f"{Path(name).stem}.txt").write_text("\n".join(lines))


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
    return {"classes": classes, "splits": splits}


def source_of(row: dict) -> tuple[str, str]:
    """(id, display name) of the dataset an ATTRIBUTION.csv row came from."""
    image_id, source = row["image_id"], row["source"]
    if image_id.startswith("rf_"):  # one Roboflow Universe project; its page is the source
        parts = source.split("universe.roboflow.com/")[-1].split("/")
        return source, f"Roboflow: {'/'.join(parts[:2])}" + (f" v{parts[-1]}" if len(parts) > 3 else "")
    if image_id.startswith("lic_"):
        return "leftincar", "LeftInCAR"
    if image_id.startswith("own_"):
        return "own", "Your own photos"
    return "openimages", "Open Images V7"


def dataset_sources() -> list[dict]:
    """The datasets merged into the training set, with how many images each contributed."""
    attribution = DATASET / "ATTRIBUTION.csv"
    groups: dict[str, dict] = {}
    if attribution.exists():
        with open(attribution, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                key, name = source_of(row)
                group = groups.setdefault(key, {"id": key, "name": name, "images": 0, "license": row["license"]})
                group["images"] += 1
    return sorted(groups.values(), key=lambda g: -g["images"])


def delete_dataset(key: str) -> int:
    """Remove every image, label and credit row of one dataset from the training set. Returns how many images went.

    The downloaded export under training/datasets/ stays, so it can be imported again. Refuses while a
    training run is going, because training reads these files every epoch.
    """
    import psutil

    if any("train.py" in " ".join(p.info["cmdline"] or []) for p in psutil.process_iter(["cmdline"])):
        raise RuntimeError("training is running; delete datasets after it finishes")
    attribution = DATASET / "ATTRIBUTION.csv"
    with open(attribution, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    doomed = {row["image_id"] for row in rows if source_of(row)[0] == key}
    if not doomed:
        raise ValueError("unknown dataset")
    for image_id in doomed:
        for pattern in (f"images/*/{image_id}.*", f"labels/*/{image_id}.txt"):
            for path in DATASET.glob(pattern):
                path.unlink()
    for cache in DATASET.glob("labels/*.cache"):
        cache.unlink()  # Ultralytics rebuilds it
    with open(attribution, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["subset", "image_id", "license", "author", "source"])
        writer.writeheader()
        writer.writerows(row for row in rows if row["image_id"] not in doomed)
    return len(doomed)


def s3_has(key: str) -> bool:
    try:
        s3_client().head_object(Bucket=s3_bucket(), Key=key)
        return True
    except s3_client().exceptions.ClientError:
        return False


def pick_items(text: str) -> dict:
    """Gemini picks the items asked for from the transcript; the keyword matcher in find.py is the fallback without a key."""
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        try:
            return pick_targets(text, CLASSES, key, os.environ.get("GEMINI_MODEL") or MODEL)
        except (SystemExit, requests.RequestException, KeyError, IndexError, ValueError) as error:
            print(f"[narrator] could not pick the item: {error}", flush=True)
    return {"targets": [t[0] for t in extract_targets(text, CLASSES) if t[1]], "unsupported": None}


def pi_find(text: str) -> dict:
    """Pick the item(s), drop jobs/<id>.json (with them) for the Pi, and wait for incoming/<id>.jpg. results/<id>_result.* come from elsewhere."""
    picked = pick_items(text)
    if not picked["targets"]:  # nothing to look for: answer now, no photo
        status = "unsupported" if picked["unsupported"] else "no_target"
        said = {"status": status, "target": picked["unsupported"], "matches": [], "known": CLASSES}
        return {"job": None, "photo": None, "narration": narration_for(said), "message": "I do not know which item to look for."}
    s3, bucket = s3_client(), s3_bucket()
    job = uuid.uuid4().hex[:8]
    key = f"incoming/{job}.jpg"
    s3.put_object(Bucket=bucket, Key=f"jobs/{job}.json", Body=json.dumps({"text": text, "targets": picked["targets"]}).encode())
    deadline = time.time() + 30
    while not s3_has(key):
        if time.time() > deadline:
            s3.delete_object(Bucket=bucket, Key=f"jobs/{job}.json")  # unclaimed: do not leave a stale job for the Pi
            raise TimeoutError("the Pi did not upload a photo")
        time.sleep(1)
    return {"job": job, "photo": key, "targets": picked["targets"]}


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
        if url.path == "/api/models":
            return self._json(200, model_listing())
        if url.path == "/api/s3/results":  # ?prefix=results|incoming: the photos in the AWS bucket, newest first
            prefix = parse_qs(url.query).get("prefix", ["results"])[0]
            if prefix not in ("results", "incoming"):
                return self._json(404, {"error": "unknown prefix"})
            pages = s3_client().get_paginator("list_objects_v2").paginate(Bucket=s3_bucket(), Prefix=f"{prefix}/")
            objects = sorted((o for page in pages for o in page.get("Contents", []) if o["Key"].endswith(".jpg")), key=lambda o: o["LastModified"], reverse=True)
            keys = [o["Key"] for o in objects]
            return self._json(200, {"bucket": s3_bucket(), "keys": keys})
        if url.path == "/api/pi/result":  # ?job=<id>: 202 until results/<id>_result.jpg is in the bucket, then its key + narration
            job = parse_qs(url.query).get("job", [""])[0]
            key = f"results/{job}_result.jpg"
            if not s3_has(key):
                return self._json(202, {"pending": True})
            reply = {"photo": key, "narration": None, "message": None}
            try:  # results/<id>_result.json (uploaded before the jpg) holds what the model found: status, target, matches
                found = json.loads(s3_client().get_object(Bucket=s3_bucket(), Key=f"results/{job}_result.json")["Body"].read())
                reply.update(narration=narration_for(found), message=found.get("message"))
            except (s3_client().exceptions.ClientError, ValueError, KeyError):
                pass  # no findings file: the popup shows the picture without a spoken line
            return self._json(200, reply)
        if url.path == "/api/s3/image":
            key = parse_qs(url.query).get("key", [""])[0]
            if not key.startswith(("results/", "incoming/")):  # only the photo prefixes are served
                return self._json(404, {"error": "image not found"})
            return self._send(200, s3_client().get_object(Bucket=s3_bucket(), Key=key)["Body"].read(), "image/jpeg")
        if url.path == "/api/own/list":
            return self._json(200, own_listing())
        if url.path == "/api/own/image":
            image = own_image(parse_qs(url.query).get("name", [""])[0])
            return self._send(200, image.read_bytes(), "image/jpeg") if image else self._json(404, {"error": "image not found"})
        if url.path == "/api/dataset/sources":
            return self._json(200, {"sources": dataset_sources()})
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
            elif url.path == "/api/own/upload":  # body = one image file; the UI sends a bulk upload one file at a time
                self._json(200, {"file": save_upload(self._body())})
            elif url.path == "/api/own/save":  # body = {"file": "mine_x.jpg", "boxes": [{"cls": 5, "box": [x1, y1, x2, y2]}]}
                body = json.loads(self._body())
                save_labels(body["file"], body["boxes"])
                self._json(200, {"ok": True})
            elif url.path == "/api/own/edit":  # body = {"file", "op": "rotate"|"crop", "arg", "boxes"}
                body = json.loads(self._body())
                self._json(200, {"boxes": edit_photo(body["file"], body["op"], body["boxes"], body["arg"])})
            elif url.path == "/api/dataset/delete":  # body = {"id": one of the ids from GET /api/dataset/sources}
                removed = delete_dataset(json.loads(self._body())["id"])
                self._json(200, {"removed": removed, "sources": dataset_sources()})
            elif url.path == "/api/own/delete":  # body = {"file": "mine_x.jpg"}
                image = own_image(json.loads(self._body())["file"])
                if image:
                    image.unlink()
                    (MINE / "labels" / f"{image.stem}.txt").unlink(missing_ok=True)
                self._json(200, {"ok": True})
            elif url.path == "/api/find":  # body = JPEG photo, ?text = what the user said
                query = parse_qs(url.query)
                result = find(self._body(), query.get("text", [""])[0])
                result["narration"] = None if query.get("quick") else narration_for(result)  # None -> the UI shows the plain "message"; quick=1 skips Gemini
                self._json(200, result)
            elif url.path == "/api/pi/find":  # ?text = what the user said; asks the Pi for a photo, then runs find() on it
                query = parse_qs(url.query)
                self._json(200, pi_find(query.get("text", [""])[0]))
            elif url.path == "/api/model":  # body = {"name": one of the names from GET /api/models}
                global WEIGHTS
                name = json.loads(self._body())["name"]
                if name not in {m["name"] for m in model_listing()["models"]}:  # only known weights files, no free paths
                    return self._json(400, {"error": "unknown model"})
                with _model_lock:
                    WEIGHTS = ROOT / name if not Path(name).is_absolute() else Path(name)
                threading.Thread(target=warm_up, daemon=True).start()  # load it now, not on the next photo
                self._json(200, model_listing())
            elif url.path == "/api/trouble":  # body = {"problem": "..."}; Sherlock explains instead of the UI showing an error
                problem = json.loads(self._body())["problem"]
                print(f"[trouble] {problem}", flush=True)
                self._json(200, {"narration": narration_for({"status": "trouble", "target": None, "matches": [], "problem": problem})})
            else:
                self._json(404, {"error": "not found"})
        except TimeoutError:  # the Pi did not answer in time
            self._json(504, {"error": "the Pi did not answer in time"})
        except FileNotFoundError as error:  # no trained weights yet
            self._json(503, {"error": str(error)})
        except SystemExit as error:  # transcribe/synthesize exit with the upstream error message
            print(f"[error] {error}", flush=True)
            self._json(502, {"error": str(error)})
        except RuntimeError as error:  # delete refused while training runs
            self._json(409, {"error": str(error)})
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
