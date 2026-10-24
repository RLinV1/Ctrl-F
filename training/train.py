"""Fine-tune a pretrained YOLO model on the Ctrl-F item classes.

    python training/train.py                       # yolo11n, 50 epochs
    python training/train.py --model yolo11s.pt --epochs 100 --batch 8

Best weights land in runs/ctrlf/<name>/weights/best.pt (git-ignored). Upload them to storage under
models/<version>/best.pt and point YOLO_WEIGHTS_PATH at them (see docs/TRAINING.md).
Needs: pip install ultralytics   (use Python 3.11 or 3.12; PyTorch wheels lag behind new Python releases)
"""
import argparse
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data.yaml"
RUNS = Path(__file__).resolve().parent.parent / "runs"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--data", type=Path, default=DATA, help="dataset yaml (default: training/data.yaml)")
    parser.add_argument("--model", default="yolo11n.pt", help="pretrained starting weights")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default=None, help="e.g. 0 for the first GPU, or cpu")
    parser.add_argument("--name", default="ctrlf", help="run name")
    args = parser.parse_args()

    from ultralytics import YOLO  # imported late so --help works without it installed

    YOLO(args.model).train(
        data=str(args.data.resolve()),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(RUNS),
        name=args.name,
    )


if __name__ == "__main__":
    main()
