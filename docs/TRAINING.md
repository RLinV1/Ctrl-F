# YOLO Training Plan

Ctrl-F uses a custom-trained YOLO model. Stock COCO weights cannot detect keys, wallets, or earbuds, so we fine-tune a pretrained Ultralytics YOLO model on our own images.

## Scope

- The set of trained classes is the set of items Ctrl-F can find. Asking for an untrained item must produce a clear "I can't look for that yet" reply from the narrator.
- Start small: 5 to 10 classes (e.g. keys, wallet, phone, remote, glasses, earbuds, mug). Add classes later by repeating the loop below.

## Pipeline

1. **Collect.** Photograph each item in the real environment: the Pi camera, the real room, varied positions, lighting, clutter, partial occlusion. Aim for 150+ images per class to start. Always capture with the Pi camera, since training data must match what inference sees.
2. **Label.** Draw boxes in Roboflow, CVAT, or Label Studio. Export in YOLO format (`images/` + `labels/` + `data.yaml`).
3. **Split.** 70/20/10 train/val/test. Split by scene or session, not randomly per image, to avoid near-duplicate leakage.
4. **Train.** Fine-tune from a pretrained small model (YOLO11n or YOLO11s). Use augmentation (flip, brightness, scale). Train on a GPU (local or cloud).
5. **Evaluate.** Report mAP50 and per-class recall on the held-out test set. Target: per-class recall >= 80% on the test set (matches PRD success metric).
6. **Export.** Save `best.pt`. Store weights in object storage under `models/<version>/best.pt`. Do not commit weights or datasets to git.
7. **Deploy.** The desktop service loads weights by version from config (`YOLO_WEIGHTS_PATH`).
8. **Improve.** Real misses and false positives from production snapshots become new training images (hard-example mining). Retrain, compare to the previous version on the same test set, promote only if better.

## Repo layout (planned)

```
training/
  data.yaml        class names and dataset paths (small, committed)
  train.py         thin wrapper around Ultralytics training
  eval.py          runs the test split and prints mAP / per-class recall
  README.md        how to reproduce a run
```

Datasets and weights live outside git (object storage or a local `data/` folder in `.gitignore`).

## Versioning

- Model version = date + short tag (e.g. `2026-11-02-v1`).
- Record for each version: dataset snapshot, class list, hyperparameters, metrics.
- The class list in `data.yaml` must match what the narrator and UI show.

## Risks

- Small datasets overfit to one room or lighting. Collect across times of day.
- Look-alike items (two black wallets) confuse the model. Label by function, not by owner.
- Labeling time is the real cost. Budget for it early.
- Training needs a GPU. Decide where it runs before the first run.
