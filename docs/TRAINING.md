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

## Model lineage (2026-10-24)

Every model starts from stock Ultralytics weights and trains on all the data collected so far, so each run is a superset of the one before. Scores come from `python training/eval.py <best.pt> --frozen`, which uses photos that are never trained on (see below).

| Run | Start weights | Data added | Folder |
| --- | --- | --- | --- |
| `small-items` | yolo26n | Open Images, keys, wallet, AirPods (first Roboflow sets) | `runs/small-items` |
| `small-items-2` | yolo26n | + Headphones Detection, finer AirPods split | `runs/small-items-2` |
| `small-items-3` | yolo26n | + `Third Model/`: Airpods v7, wallet-iiyy3, Charger v6, headphones-746cn, your labeled photos | `runs/small-items-3` |
| `small-items-4` | yolo26s | + `Fourth Model/`: watches, glasses, more keys, chargers, headphones, remotes | `runs/small-items-4` |

### How data gets in

- `python training/fetch_roboflow.py <project> <workspace> <version> --out "training/datasets/<folder>"` downloads a Roboflow Universe dataset. It needs `ROBOFLOW_API_KEY` in `.env` and refuses anything that is not CC BY 4.0, CC0 or public domain.
- `python training/audit_dataset.py "training/datasets/<folder>"` prints label statistics (box sizes, close-ups, augmented copies) and can write a contact sheet to look at.
- `python training/import_roboflow.py <export> --map THEIRS=OURS ... [--max N] [--max-area 0.5] [--hold-test DIR]` merges one export into `training/datasets/personal`. `--max` caps the images from one source, `--max-area` drops close-ups (the target is a messy room, not a product shot), `--hold-test` sends the export's own test photos to a frozen folder instead of training.
- `python training/import_own.py` adds the photos you labeled in the dev UI's Label photos tab.
- `python training/audit_licenses.py` checks every dataset's license against Roboflow itself.

### Frozen test sets

`training/datasets/frozen_test/` holds the held-out photos from when model 2 was trained. `frozen_test/fourth_model/` holds the held-out photos of the Fourth Model datasets. Both are excluded from training, so scores are comparable between models. Score on the second with `eval.py --frozen fourth_model`.

### Choices made for messy rooms

Lost items sit among clutter, so the data is filtered toward that: close-ups where one box fills most of the photo are dropped, product shots are capped, and datasets of items worn on people (glasses on faces, headphones on heads) were skipped. Glasses are the weakest class for that reason; your own labeled photos of glasses on tables will help more than any public set.
