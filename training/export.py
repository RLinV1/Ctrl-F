"""Export trained weights for the Raspberry Pi and time inference on this machine.

    python training/export.py runs/small-items/weights/best.pt              # NCNN at 416 px
    python training/export.py best.pt --imgsz 320 --format onnx

NCNN is the fastest CPU format for a Pi 4. The timing printed here is for THIS machine's CPU, not the
Pi: copy the exported folder to the Pi and run it there to get the real number.
Smaller --imgsz is faster but loses small items (keys, earbuds); try 320, 416, and 640 on the Pi.
"""
import argparse
import statistics
import time
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("weights", type=Path)
    parser.add_argument("--imgsz", type=int, default=416)
    parser.add_argument("--format", default="ncnn", choices=["ncnn", "onnx", "tflite"])
    parser.add_argument("--image", type=Path, help="image for the timing test (default: a bundled sample)")
    args = parser.parse_args()

    from ultralytics import YOLO

    exported = YOLO(str(args.weights)).export(format=args.format, imgsz=args.imgsz)
    print(f"exported: {exported}")
    size_mb = sum(f.stat().st_size for f in Path(exported).rglob("*") if f.is_file()) / 1e6 if Path(exported).is_dir() else Path(exported).stat().st_size / 1e6
    print(f"size: {size_mb:.1f} MB")

    model = YOLO(str(exported), task="detect")
    source = str(args.image) if args.image else "https://ultralytics.com/images/bus.jpg"
    model.predict(source, imgsz=args.imgsz, device="cpu", verbose=False)  # warm-up
    times = []
    for _ in range(10):
        started = time.perf_counter()
        model.predict(source, imgsz=args.imgsz, device="cpu", verbose=False)
        times.append((time.perf_counter() - started) * 1000)
    print(f"CPU inference on this machine at {args.imgsz}px: median {statistics.median(times):.0f} ms")


if __name__ == "__main__":
    main()
