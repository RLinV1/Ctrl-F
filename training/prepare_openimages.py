"""Build a small-lost-items YOLO dataset from Open Images V7 (validation + test splits).

    python training/prepare_openimages.py                 # ~250 images per class
    python training/prepare_openimages.py --per-class 400

Classes are small things people lose: phone, glasses, remote, watch, headphones. Open Images has no keys,
wallet, wires or cables, AirPods, or AirPods case; get those from other sources or your own photos
(see training/README.md).

Open Images annotations are CC BY 4.0. Each image carries its own license in the metadata; this script
keeps only images licensed CC BY (no NC/ND/SA) and writes datasets/personal/ATTRIBUTION.csv with the
author and source of every image used. Keep that file with the data: CC BY requires credit.
Output: datasets/personal/{images,labels}/{train,val,test} and training/personal.yaml.
"""
import argparse
import csv
import random
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from classes import CLASSES as ALL_CLASSES, yaml_text

ROOT =Path(__file__).resolve().parent.parent
CACHE = ROOT / "datasets" / "oi"
OUT = ROOT / "datasets" / "personal"
YAML = Path(__file__).resolve().parent / "personal.yaml"

CLASSES = {  # Open Images label id -> our class name (order = class index)
    "/m/050k8": "phone",
    "/m/0jyfg": "glasses",
    "/m/0qjjc": "remote",
    "/m/0gjkl": "watch",
    "/m/01b7fy": "headphones",
}
INDEX = {label: ALL_CLASSES.index(name) for label, name in CLASSES.items()}  # class order is set in classes.py
SPLITS = {
    "validation": (
        "https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv",
        "https://storage.googleapis.com/openimages/2018_04/validation/validation-images-with-rotation.csv",
    ),
    "test": (
        "https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv",
        "https://storage.googleapis.com/openimages/2018_04/test/test-images-with-rotation.csv",
    ),
}
IMAGE_URL = "https://open-images-dataset.s3.amazonaws.com/{split}/{id}.jpg"
MIN_BOX_AREA = 0.002  # skip specks smaller than ~0.2% of the image: unreliable labels
SEED = 0


def cached(url: str) -> Path:
    path = CACHE / url.rsplit("/", 1)[1]
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}")
        with requests.get(url, stream=True, timeout=60) as response:
            response.raise_for_status()
            with open(path, "wb") as f:
                for chunk in response.iter_content(1 << 20):
                    f.write(chunk)
    return path


def read_boxes(path: Path) -> dict[str, list[list[float]]]:
    """image id -> [[class_idx, cx, cy, w, h], ...] for our classes (groups, depictions, specks skipped)."""
    boxes: dict[str, list[list[float]]] = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["LabelName"] not in INDEX or row["IsGroupOf"] == "1" or row["IsDepiction"] == "1":
                continue
            x0, x1, y0, y1 = (float(row[k]) for k in ("XMin", "XMax", "YMin", "YMax"))
            if (x1 - x0) * (y1 - y0) < MIN_BOX_AREA:
                continue
            boxes.setdefault(row["ImageID"], []).append(
                [INDEX[row["LabelName"]], (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0]
            )
    return boxes


def read_licenses(path: Path) -> dict[str, dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as f:
        return {row["ImageID"]: row for row in csv.DictReader(f)}


def is_cc_by(license_url: str) -> bool:
    return "/licenses/by/" in license_url  # "by" only, not by-nc, by-nd, by-sa


def pick(boxes, meta, per_class: int, rng: random.Random) -> list[str]:
    chosen: set[str] = set()
    for class_idx in INDEX.values():
        candidates = [i for i, b in boxes.items() if i in meta and is_cc_by(meta[i]["License"])
                      and any(int(x[0]) == class_idx for x in b)]
        rng.shuffle(candidates)
        chosen.update(candidates[:per_class])
    return sorted(chosen)


def download(job: tuple[str, str, Path]) -> bool:
    split, image_id, dest = job
    try:
        response = requests.get(IMAGE_URL.format(split=split, id=image_id), timeout=30)
        response.raise_for_status()
        dest.write_bytes(response.content)
        return True
    except requests.RequestException:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--per-class", type=int, default=250, help="max images to pick per class per OI split")
    args = parser.parse_args()
    rng = random.Random(SEED)

    items = []  # (oi_split, image_id, boxes, meta)
    for split, (bbox_url, meta_url) in SPLITS.items():
        boxes, meta = read_boxes(cached(bbox_url)), read_licenses(cached(meta_url))
        picked = pick(boxes, meta, args.per_class, rng)
        print(f"{split}: {len(picked)} CC BY images selected")
        items += [(split, i, boxes[i], meta[i]) for i in picked]

    rng.shuffle(items)
    n = len(items)
    cuts = {"train": items[: int(n * 0.8)], "val": items[int(n * 0.8): int(n * 0.9)], "test": items[int(n * 0.9):]}

    jobs, labels, attribution = [], [], []
    for subset, group in cuts.items():
        for sub in ("images", "labels"):
            (OUT / sub / subset).mkdir(parents=True, exist_ok=True)
        for split, image_id, boxes, meta in group:
            jobs.append((split, image_id, OUT / "images" / subset / f"{image_id}.jpg"))
            labels.append(OUT / "labels" / subset / f"{image_id}.txt")
            labels[-1].write_text("\n".join(f"{int(b[0])} {b[1]:.6f} {b[2]:.6f} {b[3]:.6f} {b[4]:.6f}" for b in boxes))
            attribution.append([subset, image_id, meta["License"], meta["Author"], meta["OriginalLandingURL"]])

    with ThreadPoolExecutor(16) as pool:
        ok = list(pool.map(download, jobs))
    for (_, _, image_path), label_path, good in zip(jobs, labels, ok):
        if not good:  # drop images that failed to download, with their labels
            label_path.unlink(missing_ok=True)
            image_path.unlink(missing_ok=True)
    print(f"downloaded {sum(ok)}/{len(ok)} images")

    with open(OUT / "ATTRIBUTION.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["subset", "image_id", "license", "author", "source"])
        writer.writerows(row for row, good in zip(attribution, ok) if good)

    YAML.write_text(
        yaml_text("Open Images V7 (CC BY) and LeftInCAR (CC BY 4.0); credits in datasets/personal/ATTRIBUTION.csv"),
        encoding="utf-8",
    )
    print(f"wrote {YAML}")


if __name__ == "__main__":
    main()
