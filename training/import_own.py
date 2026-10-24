"""Add the photos labeled in the dev-test Label tab to training/datasets/personal.

    python training/import_own.py

Reads training/datasets/mine/{images,labels}. Only labeled photos are used; a photo whose label file is empty
is kept as a negative example (none of our items in it). Photos are split 80/10/10 in blocks of consecutive
files, like the other imports. Safe to run again: it first removes the own_* files it added last time.
"""
import csv
import random
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MINE = ROOT / "training" / "datasets" / "mine"
OUT = ROOT / "training" / "datasets" / "personal"
BLOCK = 5  # your own set is small and shot in sessions, so keep blocks short
SEED = 0


def main() -> None:
    for old in OUT.glob("*/*/own_*"):
        old.unlink()
    attribution = OUT / "ATTRIBUTION.csv"
    rows = [r for r in csv.reader(attribution.open(encoding="utf-8"))] if attribution.exists() else [["subset", "image_id", "license", "author", "source"]]
    rows = [r for r in rows if not r[1].startswith("own_")]

    photos = sorted(p for p in (MINE / "images").glob("*.jpg") if (MINE / "labels" / f"{p.stem}.txt").exists())
    blocks = [photos[i:i + BLOCK] for i in range(0, len(photos), BLOCK)]
    random.Random(SEED).shuffle(blocks)
    counts = {"train": 0, "val": 0, "test": 0}
    for k, block in enumerate(blocks):
        subset = "train" if k < len(blocks) * 0.8 else "val" if k < len(blocks) * 0.9 else "test"
        for photo in block:
            image_id = f"own_{photo.stem}"
            for sub in ("images", "labels"):
                (OUT / sub / subset).mkdir(parents=True, exist_ok=True)
            shutil.copy2(photo, OUT / "images" / subset / f"{image_id}.jpg")
            shutil.copy2(MINE / "labels" / f"{photo.stem}.txt", OUT / "labels" / subset / f"{image_id}.txt")
            rows.append([subset, image_id, "own photo", "project owner", ""])
            counts[subset] += 1
    with attribution.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)
    for cache in (OUT / "labels").glob("*.cache"):
        cache.unlink()  # Ultralytics rebuilds it
    print(f"added {sum(counts.values())} own photos {counts}")


if __name__ == "__main__":
    main()
