"""Score trained weights on the held-out test split.

    python training/eval.py runs/ctrlf/ctrlf/weights/best.pt

Prints mAP50 and per-class recall. Target from docs/PRD.md: recall >= 0.80 for every class.
"""
import argparse
import sys
from pathlib import Path

from datacfg import resolved

DATA = Path(__file__).resolve().parent / "data.yaml"
TARGET_RECALL = 0.8


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("weights", type=Path)
    parser.add_argument("--data", type=Path, default=DATA, help="dataset yaml (default: training/data.yaml)")
    parser.add_argument("--frozen", nargs="?", const="", metavar="SUBFOLDER", help="score on training/datasets/frozen_test (the same photos for every model) instead of --data; "
                        "give a subfolder name such as fourth_model for that held-out set")
    args = parser.parse_args()
    if not args.weights.exists():
        sys.exit(f"Weights not found: {args.weights}")

    from ultralytics import YOLO

    model = YOLO(str(args.weights))
    data = resolved(args.data)
    if args.frozen is not None:  # same photos for every model; names are the full class list, so older, smaller models still score
        import yaml
        from classes import CLASSES

        config = {"path": str(Path(__file__).resolve().parent / "datasets" / "frozen_test" / args.frozen), "train": "images/test", "val": "images/test",
                  "test": "images/test", "names": dict(enumerate(CLASSES))}
        data = str(Path(__file__).resolve().parent / "frozen_test.run.yaml")
        Path(data).write_text(yaml.safe_dump(config), encoding="utf-8")
    box = model.val(data=data, split="test").box
    print(f"mAP50: {box.map50:.3f}")
    failing = 0
    for class_id, recall in zip(box.ap_class_index, box.r):
        ok = recall >= TARGET_RECALL
        failing += not ok
        print(f"{'PASS' if ok else 'FAIL'} recall {recall:.2f}  {model.names[int(class_id)]}")
    sys.exit(1 if failing else 0)


if __name__ == "__main__":
    main()
