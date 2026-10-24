"""Quick quality check of downloaded Roboflow exports, before they go into the training set.

    python training/audit_dataset.py "training/datasets/Fourth Model"            # one line per export
    python training/audit_dataset.py "training/datasets/Fourth Model/tv-remote.v1.yolov11" --sheet out.jpg

Per export: images, boxes per class, how big the boxes are, how many photos are close-ups (one box over 60% of the
photo), how many distinct originals there are (Roboflow adds augmented copies named <original>_jpg.rf.<hash>), and
how many label files are empty or unreadable. --sheet writes a contact sheet of 12 random photos with their boxes,
for a look with your own eyes.
"""
import argparse
import random
import re
import statistics
from pathlib import Path

import yaml
from PIL import Image, ImageDraw


def read_labels(label: Path) -> list[tuple[int, float, float, float, float]]:
    boxes = []
    for line in label.read_text().splitlines() if label.exists() else []:
        p = line.split()
        if len(p) == 5:
            boxes.append((int(p[0]), *map(float, p[1:])))
        elif len(p) >= 7 and len(p) % 2 == 1:  # polygon: use its bounding box
            xs, ys = [float(v) for v in p[1::2]], [float(v) for v in p[2::2]]
            boxes.append((int(p[0]), (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(xs) - min(xs), max(ys) - min(ys)))
    return boxes


def audit(folder: Path, sheet: Path | None) -> None:
    config = yaml.safe_load((folder / "data.yaml").read_text(encoding="utf-8"))
    names = config["names"]
    names = list(names.values()) if isinstance(names, dict) else names
    images = [p for s in ("train", "valid", "test") for p in (folder / s / "images").glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
    per_class = {n: 0 for n in names}
    areas, closeups, empty = [], 0, 0
    for image in images:
        boxes = read_labels(image.parent.parent / "labels" / f"{image.stem}.txt")
        empty += not boxes
        closeups += any(w * h > 0.6 for _, _, _, w, h in boxes)
        for c, _, _, w, h in boxes:
            per_class[names[c]] += 1
            areas.append(w * h)
    originals = {re.sub(r"_(jpg|jpeg|png)\.rf\..*", "", p.stem) for p in images}
    info = config.get("roboflow", {})
    print(f"{folder.name}: {len(images)} photos from {len(originals)} originals, license {info.get('license')}")
    print(f"   boxes {per_class}; median box covers {statistics.median(areas) * 100 if areas else 0:.1f}% of the photo; "
          f"close-ups {closeups / max(len(images), 1):.0%}; photos without boxes {empty}")
    if sheet and images:
        tiles = []
        for image in random.Random(0).sample(images, min(12, len(images))):
            im = Image.open(image).convert("RGB")
            draw = ImageDraw.Draw(im)
            for c, cx, cy, w, h in read_labels(image.parent.parent / "labels" / f"{image.stem}.txt"):
                draw.rectangle([(cx - w / 2) * im.width, (cy - h / 2) * im.height, (cx + w / 2) * im.width, (cy + h / 2) * im.height], outline="lime", width=4)
                draw.text(((cx - w / 2) * im.width + 4, (cy - h / 2) * im.height + 4), names[c], fill="yellow")
            tiles.append(im.resize((320, 240)))
        canvas = Image.new("RGB", (320 * 4, 240 * 3))
        for i, tile in enumerate(tiles):
            canvas.paste(tile, ((i % 4) * 320, (i // 4) * 240))
        canvas.save(sheet, quality=85)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("path", type=Path, help="one export, or a folder of exports")
    parser.add_argument("--sheet", type=Path, help="write a contact sheet (only for a single export)")
    args = parser.parse_args()
    exports = [args.path] if (args.path / "data.yaml").exists() else sorted(p for p in args.path.iterdir() if (p / "data.yaml").exists())
    for export in exports:
        audit(export, args.sheet if len(exports) == 1 else None)


if __name__ == "__main__":
    main()
