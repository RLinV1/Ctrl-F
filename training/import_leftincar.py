"""Add the LeftInCAR dataset (keys, wallet, phone, glasses) to training/datasets/personal.

    python training/import_leftincar.py C:/Users/me/ctrlf-downloads/leftincar/leftincar-data.zip

LeftInCAR: Santos et al., "LeftInCAR: In-Vehicle Object Detection Dataset", Mendeley Data, 2025,
DOI 10.17632/dd4hw3r6dh.1, license CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Changes made here: images shrunk to --max-side, labels remapped to our classes, split into train/val/test.

The zip is treated as untrusted data: members are read in memory and written under fixed names,
nothing is extracted by path and nothing inside is executed.
"""
import argparse
import csv
import random
import zipfile
from io import BytesIO
from pathlib import Path

from classes import CLASSES, yaml_text
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "training" / "datasets" / "personal"
YAML = Path(__file__).resolve().parent / "personal.yaml"
SOURCE = "https://doi.org/10.17632/dd4hw3r6dh.1"
LICENSE = "https://creativecommons.org/licenses/by/4.0/"
AUTHOR = "Santos, Neto, Ferreira, Loureiro, Dixe, Silva, Vale, Fernandes, Peixoto, Machado (LeftInCAR)"
# LeftInCAR class id -> our class name. Everything else (laptop, card, suitcase, backpack, clothing,
# handbag) is dropped: not the small lost items we are building for.
THEIRS = {0: "smartphone", 1: "laptop", 2: "card", 3: "suitcase", 4: "wallet", 5: "backpack", 6: "clothing", 7: "keys", 8: "glasses", 9: "handbag"}
KEEP = {"smartphone": "phone", "wallet": "wallet", "keys": "keys", "glasses": "glasses"}
BLOCK = 20  # consecutive files go to the same split, to limit near-duplicate leakage between splits
SEED = 0
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def remap(label_text: str) -> list[str]:
    lines = []
    for line in label_text.splitlines():
        parts = line.split()
        if len(parts) == 5 and int(parts[0]) in THEIRS and THEIRS[int(parts[0])] in KEEP:
            lines.append(" ".join([str(CLASSES.index(KEEP[THEIRS[int(parts[0])]])), *parts[1:]]))
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("zip", type=Path)
    parser.add_argument("--max-side", type=int, default=1280)
    args = parser.parse_args()

    with zipfile.ZipFile(args.zip) as archive:
        members = {Path(n).stem + Path(n).suffix.lower(): n for n in archive.namelist() if not n.endswith("/")}
        images = sorted(n for n in members if Path(n).suffix in IMAGE_SUFFIXES)
        labels = {Path(n).stem: members[n] for n in members if n.endswith(".txt")}
        print(f"zip has {len(images)} images and {len(labels)} label files")

        rng = random.Random(SEED)
        blocks = [images[i:i + BLOCK] for i in range(0, len(images), BLOCK)]
        rng.shuffle(blocks)
        split_of = {}
        for k, block in enumerate(blocks):
            subset = "train" if k < len(blocks) * 0.8 else "val" if k < len(blocks) * 0.9 else "test"
            split_of.update({name: subset for name in block})

        for subset in ("train", "val", "test"):
            for sub in ("images", "labels"):
                (OUT / sub / subset).mkdir(parents=True, exist_ok=True)
        attribution_path = OUT / "ATTRIBUTION.csv"
        new_file = not attribution_path.exists()
        kept = {"train": 0, "val": 0, "test": 0}
        with open(attribution_path, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if new_file:
                writer.writerow(["subset", "image_id", "license", "author", "source"])
            for name in images:
                stem = Path(name).stem
                lines = remap(archive.read(labels[stem]).decode("utf-8", "replace")) if stem in labels else []
                if not lines:
                    continue  # no small-item boxes in this photo
                image = Image.open(BytesIO(archive.read(members[name]))).convert("RGB")
                image.thumbnail((args.max_side, args.max_side))  # keeps aspect ratio; labels are normalized so they still match
                subset, image_id = split_of[name], f"lic_{stem}"
                image.save(OUT / "images" / subset / f"{image_id}.jpg", quality=90)
                (OUT / "labels" / subset / f"{image_id}.txt").write_text("\n".join(lines))
                writer.writerow([subset, image_id, LICENSE, AUTHOR, SOURCE])
                kept[subset] += 1

    YAML.write_text(yaml_text("Open Images V7 (CC BY) and LeftInCAR (CC BY 4.0); credits in training/datasets/personal/ATTRIBUTION.csv"), encoding="utf-8")
    print(f"added {sum(kept.values())} images {kept}; wrote {YAML}")


if __name__ == "__main__":
    main()
