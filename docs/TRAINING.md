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

## Train your dataset

See [training/README.md](../training/README.md) for the virtual environment setup,
YOLO label format, dataset YAML example, and device selection. From the repo root:

```bash
python training/train.py --data /absolute/path/to/data.yaml --name ctrlf-v1
```

This uses YOLO11n by default and prints the actual absolute `best.pt` path and
`YOLO_WEIGHTS_PATH` assignment when training succeeds. It preserves earlier runs
and does not change the worker configuration. Classes come from your dataset;
there is no fixed class list in the training script.

Evaluate the resulting model before deployment (configure `test` in data.yaml):

```bash
yolo detect val model=/absolute/path/to/weights/best.pt data=/absolute/path/to/data.yaml split=test
yolo detect predict model=/absolute/path/to/weights/best.pt source=/absolute/path/to/new-pi-photo.jpg save=True
```

Record mAP50 and per-class recall and inspect boxes/labels on fresh Pi images.
These real training and evaluation commands are manual operator checks, not
checks executed by the offline test suite.

## Deploy as raymond

Log in as `raymond` on the deployment PC. Copy the trained weights from the path
printed by training into a versioned directory Raymond owns:

```bash
mkdir -p /home/raymond/models/ctrlf-v1
cp /absolute/path/to/weights/best.pt /home/raymond/models/ctrlf-v1/best.pt
test -r /home/raymond/models/ctrlf-v1/best.pt
```

If another account trained the model, make the source file readable to Raymond
before copying. In your repo-root `.env`, set:

```dotenv
YOLO_WEIGHTS_PATH=/home/raymond/models/ctrlf-v1/best.pt
```

The current `desktop/server.py` is an S3 polling worker. It loads weights once at
startup. Existing process environment variables take precedence, followed by
`.ctrlf-server.env` loaded from the launch directory, followed by `.env`. Check for
an older override if the worker still loads the old model. Keep any
`.ctrlf-server.env` outside git because it can contain credentials.

From the repo root, activate Raymond's Python environment, install
`desktop/requirements.txt` if needed, stop the prior worker, and start it again:

```bash
source .venv/bin/activate
python -m pip install -r desktop/requirements.txt
python desktop/server.py
```

Keep the worker's existing S3 settings. Submit a fresh capture/job and inspect its
new result JSON and annotated JPEG for expected custom labels and boxes. Existing
results are skipped, so use a new job rather than expecting old captures to be
reprocessed. An empty weights setting falls back to stock yolov8n.pt; explicitly
set the custom path.

Target matching is exact. The web currently discovers classes from the newest
result containing `known`; the worker only includes this field for `no_target`
requests. After changing classes, submit a request that produces empty targets
and verify its result lists the new classes before testing targeted requests.
Otherwise the web may use an old list or its built-in fallback. This workflow
does not change target extraction or class discovery behavior.

For rollback, retain the previous version's file, restore its `YOLO_WEIGHTS_PATH`,
and restart the worker. Training never automatically replaces deployed weights.

## Repo layout

```
training/
  train.py         thin wrapper around Ultralytics training
  README.md        how to reproduce a run
  requirements.txt training dependencies and pytest
  tests/           offline CLI and trainer integration checks
```

Datasets and weights live outside git (object storage or a local `data/` folder in `.gitignore`).

Supply your own dataset YAML; evaluation uses the Ultralytics CLI shown above.

## Versioning

- Model version = date + short tag (e.g. `2026-11-02-v1`).
- Record for each version: dataset snapshot, class list, hyperparameters, metrics.
- The class list in `data.yaml` must match what the narrator and UI show.

## Risks

- Small datasets overfit to one room or lighting. Collect across times of day.
- Look-alike items (two black wallets) confuse the model. Label by function, not by owner.
- Labeling time is the real cost. Budget for it early.
- Training needs a GPU. Decide where it runs before the first run.
