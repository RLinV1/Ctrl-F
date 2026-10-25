#!/usr/bin/env python3
"""Fine-tune detection weights from an existing YOLO dataset export."""

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence


def positive_int(value: str) -> int:
    """Parse a strictly positive training setting."""
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def build_parser() -> argparse.ArgumentParser:
    """Build the command interface without importing the training stack."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, type=Path, help="YOLO detection dataset YAML")
    parser.add_argument("--model", default="yolo11n.pt", help="Starting weights (default: yolo11n.pt)")
    parser.add_argument("--epochs", type=positive_int, default=100)
    parser.add_argument("--imgsz", type=positive_int, default=640)
    parser.add_argument("--batch", type=positive_int, default=16)
    parser.add_argument("--device", help="Training device, e.g. 0 (CUDA GPU) or cpu; default: automatic")
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1] / "runs/detect",
                        help="Output parent (default: repo-root runs/detect)")
    parser.add_argument("--name", default="ctrlf", help="Run name; existing runs are preserved")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Train and report the actual deployment artifact; return a process exit code."""
    parser = build_parser()
    args = parser.parse_args(argv)
    data = args.data.expanduser().resolve()
    if not data.is_file():
        parser.error(f"dataset YAML does not exist or is not a file: {data}")
    if not args.name.strip() or args.name in (".", "..") or Path(args.name).name != args.name:
        parser.error("--name must be a nonempty single directory name")
    try:
        from ultralytics import YOLO

        model = YOLO(args.model)
        options = dict(data=str(data), epochs=args.epochs, imgsz=args.imgsz, batch=args.batch,
                       project=str(args.project.expanduser().resolve()), name=args.name,
                       save=True, exist_ok=False)
        if args.device is not None:
            options["device"] = args.device
        model.train(**options)
        best = (Path(model.trainer.save_dir) / "weights/best.pt").resolve()
        if not best.is_file():
            raise FileNotFoundError(f"training did not produce best weights: {best}")
    except ImportError as exc:
        print(f"Training dependencies unavailable: {exc}. Run: pip install -r training/requirements.txt", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Training failed for {data}: {exc}", file=sys.stderr)
        return 1
    print(f"Best weights: {best}")
    print("Set this in the desktop worker's .env, then restart it:")
    print(f"YOLO_WEIGHTS_PATH={json.dumps(str(best))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
