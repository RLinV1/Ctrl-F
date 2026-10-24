"""Run trained weights over a dataset split and write a JSON report: ground-truth labels, model
predictions, per-image TP/FP/FN, and overall and per-class metrics. The dev-test UI reads this file.

    python training/report.py runs/appliances/weights/best.pt --data training/appliances.yaml
    python training/report.py best.pt --data training/appliances.yaml --split val --device 0
"""
import argparse
import json
from pathlib import Path

import yaml
from datacfg import resolved

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "dev-test" / "out" / "report.json"
IOU_MATCH = 0.5
CONF = 0.25
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def iou(a: list[float], b: list[float]) -> float:
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = w * h
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union else 0.0


def read_truth(label_file: Path, names: dict[int, str]) -> list[dict]:
    """YOLO label file (class cx cy w h, normalized) -> boxes as normalized x1,y1,x2,y2."""
    boxes = []
    if label_file.exists():
        for line in label_file.read_text().splitlines():
            if line.strip():
                cls, cx, cy, w, h = line.split()
                cx, cy, w, h = float(cx), float(cy), float(w), float(h)
                boxes.append({"cls": int(cls), "name": names[int(cls)],
                              "box": [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]})
    return boxes


def count_matches(truth: list[dict], preds: list[dict]) -> tuple[int, int, int]:
    unmatched = list(truth)
    tp = 0
    for pred in sorted(preds, key=lambda p: -p["conf"]):
        best = max((t for t in unmatched if t["cls"] == pred["cls"]), key=lambda t: iou(t["box"], pred["box"]), default=None)
        if best and iou(best["box"], pred["box"]) >= IOU_MATCH:
            unmatched.remove(best)
            tp += 1
    return tp, len(preds) - tp, len(unmatched)


def split_summary(root: Path, subset: str, names: dict[int, str]) -> dict:
    images = [p for p in (root / "images" / subset).glob("*") if p.suffix.lower() in IMAGE_SUFFIXES]
    per_class = {n: 0 for n in names.values()}
    for image in images:
        for box in read_truth(root / "labels" / subset / f"{image.stem}.txt", names):
            per_class[box["name"]] += 1
    return {"images": len(images), "instances": per_class}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("weights", type=Path)
    parser.add_argument("--data", type=Path, required=True, help="dataset yaml")
    parser.add_argument("--split", default="test", choices=["train", "val", "test"])
    parser.add_argument("--device", default=None, help="0 for the first GPU, or cpu")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    from ultralytics import YOLO

    config = yaml.safe_load(args.data.read_text(encoding="utf-8"))
    root = (args.data.resolve().parent / config["path"]).resolve()
    names = {int(k): v for k, v in config["names"].items()}
    model = YOLO(str(args.weights))

    images = sorted(p for p in (root / "images" / args.split).glob("*") if p.suffix.lower() in IMAGE_SUFFIXES)
    report_images = []
    for result in model.predict([str(p) for p in images], conf=CONF, device=args.device, verbose=False, stream=True):
        image = Path(result.path)
        preds = [{"cls": int(c), "name": names[int(c)], "conf": round(float(s), 3), "box": [round(v, 4) for v in b]}
                 for c, s, b in zip(result.boxes.cls.tolist(), result.boxes.conf.tolist(), result.boxes.xyxyn.tolist())]
        truth = read_truth(root / "labels" / args.split / f"{image.stem}.txt", names)
        tp, fp, fn = count_matches(truth, preds)
        report_images.append({"file": image.name, "truth": truth, "preds": preds, "tp": tp, "fp": fp, "fn": fn})

    box = model.val(data=resolved(args.data), split=args.split, device=args.device, plots=False, verbose=False).box
    per_class = [{"name": names[int(c)], "precision": round(float(p), 3), "recall": round(float(r), 3), "ap50": round(float(a), 3)}
                 for c, p, r, a in zip(box.ap_class_index, box.p, box.r, box.ap50)]

    report = {
        "weights": str(args.weights),
        "split": args.split,
        "image_dir": str((root / "images" / args.split).relative_to(ROOT)),
        "conf_threshold": CONF,
        "iou_match": IOU_MATCH,
        "classes": list(names.values()),
        "datasets": {s: split_summary(root, s, names) for s in ("train", "val", "test")},
        "metrics": {"map50": round(float(box.map50), 3), "map50_95": round(float(box.map), 3), "per_class": per_class},
        "images": report_images,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report), encoding="utf-8")
    totals = [sum(i[k] for i in report_images) for k in ("tp", "fp", "fn")]
    print(f"{len(images)} {args.split} images | mAP50 {report['metrics']['map50']} | TP {totals[0]} FP {totals[1]} FN {totals[2]}")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
