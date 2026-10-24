"""Score trained weights on the held-out test split.

    python training/eval.py runs/ctrlf/ctrlf/weights/best.pt

Prints mAP50 and per-class recall. Target from docs/PRD.md: recall >= 0.80 for every class.
"""
import argparse
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data.yaml"
TARGET_RECALL = 0.8


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("weights", type=Path)
    args = parser.parse_args()
    if not args.weights.exists():
        sys.exit(f"Weights not found: {args.weights}")

    from ultralytics import YOLO

    model = YOLO(str(args.weights))
    box = model.val(data=str(DATA), split="test").box
    print(f"mAP50: {box.map50:.3f}")
    failing = 0
    for class_id, recall in zip(box.ap_class_index, box.r):
        ok = recall >= TARGET_RECALL
        failing += not ok
        print(f"{'PASS' if ok else 'FAIL'} recall {recall:.2f}  {model.names[int(class_id)]}")
    sys.exit(1 if failing else 0)


if __name__ == "__main__":
    main()
