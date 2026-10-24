"""Add a Roboflow Universe export (YOLO format) to training/datasets/personal, remapping its classes to ours.

    python training/import_roboflow.py "training/datasets/wallet.v1i.yolo26" --map wallet=wallet
    python training/import_roboflow.py "training/datasets/Airpods practice.v5i.yolo26" \
        --map "Airpods case closed=airpods case" "Airpods case opened=airpods case" "Earbud=airpods"

Roboflow's own train/valid/test split is ignored: all its images are pooled and re-split 80/10/10 in
blocks of consecutive files, so a dataset with a tiny valid or test split still gets a usable one.
Polygon labels (segmentation exports) are turned into boxes. Classes not named in --map are dropped.
The license and source URL are read from the export's data.yaml and written to ATTRIBUTION.csv.
"""
import argparse
import csv
import random
import shutil
from pathlib import Path

import yaml
from classes import CLASSES, yaml_text

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "training" / "datasets" / "personal"
YAML = Path(__file__).resolve().parent / "personal.yaml"
BLOCK = 10  # consecutive files go to the same split, to limit near-duplicate leakage; small enough that a 100-image set still fills val and test
SEED = 0
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def to_box(parts: list[str], cls: int) -> str | None:
    """A YOLO box line, or a polygon line reduced to its bounding box."""
    values = [float(v) for v in parts[1:]]
    if len(values) == 4:
        return f"{cls} " + " ".join(f"{v:.6f}" for v in values)
    if len(values) >= 6 and len(values) % 2 == 0:
        xs, ys = values[0::2], values[1::2]
        x1, x2, y1, y2 = min(xs), max(xs), min(ys), max(ys)
        return f"{cls} {(x1 + x2) / 2:.6f} {(y1 + y2) / 2:.6f} {x2 - x1:.6f} {y2 - y1:.6f}"
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("folder", type=Path, help="the unzipped Roboflow export")
    parser.add_argument("--map", nargs="+", required=True, metavar="THEIRS=OURS", help="their class name = our class name")
    parser.add_argument("--max", type=int, default=0, help="keep at most this many images, picked at random (0 = all); stops one big set from swamping the others")
    parser.add_argument("--max-area", type=float, default=0, help="skip photos where a box covers more than this fraction of the photo (0.6 drops close-ups, keeps cluttered scenes)")
    parser.add_argument("--hold-test", type=Path, default=None, help="folder for held-out photos (frozen test): the export's own test split goes there instead of into training")
    args = parser.parse_args()

    config = yaml.safe_load((args.folder / "data.yaml").read_text(encoding="utf-8"))
    names = config["names"]
    names = list(names.values()) if isinstance(names, dict) else names
    mapping = dict(pair.rsplit("=", 1) for pair in args.map)
    unknown = [ours for ours in mapping.values() if ours not in CLASSES]
    if unknown:
        raise SystemExit(f"not in training/classes.py: {unknown}")
    index = {names.index(theirs): CLASSES.index(ours) for theirs, ours in mapping.items()}

    info = config.get("roboflow", {})
    source, license_name = info.get("url", ""), info.get("license", "")
    prefix = f"rf_{info.get('project', args.folder.name)}".replace(" ", "_")

    images = sorted(p for split in ("train", "valid", "test") for p in (args.folder / split / "images").glob("*") if p.suffix.lower() in IMAGE_SUFFIXES)
    def lines_for(image: Path) -> list[str]:
        label = image.parent.parent / "labels" / f"{image.stem}.txt"
        lines = []
        for line in label.read_text().splitlines() if label.exists() else []:
            parts = line.split()
            if parts and int(parts[0]) in index and (box := to_box(parts, index[int(parts[0])])):
                lines.append(box)
        if args.max_area and any(float(b.split()[3]) * float(b.split()[4]) > args.max_area for b in lines):
            return []  # close-up: the item fills the photo, which does not look like a cluttered desk
        return lines

    held = []
    if args.hold_test:
        held = [p for p in images if p.parent.parent.name == "test"] or random.Random(SEED).sample(images, max(1, len(images) // 10))
        images = [p for p in images if p not in held]
        for sub in ("images", "labels"):
            (args.hold_test / sub / "test").mkdir(parents=True, exist_ok=True)
        saved = 0
        for image in held:
            lines = lines_for(image)
            if lines:
                shutil.copy2(image, args.hold_test / "images" / "test" / f"{prefix}_{image.stem}{image.suffix.lower()}")
                (args.hold_test / "labels" / "test" / f"{prefix}_{image.stem}.txt").write_text(chr(10).join(lines))
                saved += 1
        print(f"  held out {saved} photos in {args.hold_test}")
    if args.max and len(images) > args.max:
        images = sorted(random.Random(SEED).sample(images, args.max))
    blocks = [images[i:i + BLOCK] for i in range(0, len(images), BLOCK)]
    random.Random(SEED).shuffle(blocks)

    for subset in ("train", "val", "test"):
        for sub in ("images", "labels"):
            (OUT / sub / subset).mkdir(parents=True, exist_ok=True)
    kept = {"train": 0, "val": 0, "test": 0}
    attribution_path = OUT / "ATTRIBUTION.csv"
    new_file = not attribution_path.exists()
    with open(attribution_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if new_file:
            writer.writerow(["subset", "image_id", "license", "author", "source"])
        for k, block in enumerate(blocks):
            subset = "train" if k < len(blocks) * 0.8 else "val" if k < len(blocks) * 0.9 else "test"
            for image in block:
                lines = lines_for(image)
                if not lines:
                    continue  # no boxes for the classes we keep (or a close-up)
                image_id = f"{prefix}_{image.stem}"
                shutil.copy2(image, OUT / "images" / subset / f"{image_id}{image.suffix.lower()}")
                (OUT / "labels" / subset / f"{image_id}.txt").write_text("\n".join(lines))
                writer.writerow([subset, image_id, license_name, info.get("workspace", ""), source])
                kept[subset] += 1

    YAML.write_text(yaml_text("Open Images V7 (CC BY), LeftInCAR and Roboflow Universe (CC BY 4.0); credits in training/datasets/personal/ATTRIBUTION.csv"), encoding="utf-8")
    print(f"{args.folder.name}: added {sum(kept.values())} images {kept}; wrote {YAML}")


if __name__ == "__main__":
    main()
