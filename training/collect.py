"""Capture training photos from a webcam, one folder per class.

    python training/collect.py keys            # space = save a photo, q = quit
    python training/collect.py wallet --index 1

Photos go to datasets/ctrlf/raw/<class>/. Label them in Roboflow, CVAT, or Label Studio,
then export in YOLO format into datasets/ctrlf/ (images/ and labels/ with train/val/test).
For the best model, collect with the same camera that will be used at inference (the Pi).
"""
import argparse
import sys
import time
from pathlib import Path

import cv2

RAW = Path(__file__).resolve().parent.parent / "datasets" / "ctrlf" / "raw"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("item", help="class name, e.g. keys")
    parser.add_argument("--index", type=int, default=0, help="camera index (default 0)")
    args = parser.parse_args()

    out = RAW / args.item
    out.mkdir(parents=True, exist_ok=True)
    backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
    cap = cv2.VideoCapture(args.index, backend)
    if not cap.isOpened():
        sys.exit(f"Cannot open camera {args.index}. Close other apps using it, or try --index 1.")

    saved = len(list(out.glob("*.jpg")))
    print(f"Saving to {out} ({saved} already). Space = save, q = quit.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                sys.exit("Lost the camera feed.")
            view = frame.copy()
            cv2.putText(view, f"{args.item}: {saved} saved", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.imshow("Ctrl-F collect (space save, q quit)", view)
            key = cv2.waitKey(1) & 0xFF
            if key == ord(" "):
                cv2.imwrite(str(out / f"{int(time.time() * 1000)}.jpg"), frame)
                saved += 1
            elif key == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
    print(f"Done: {saved} photos of {args.item}.")


if __name__ == "__main__":
    main()
