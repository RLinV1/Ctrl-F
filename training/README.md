# Train Ctrl-F weights

Run these commands from your checkout's root. Python 3.11+ is required.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r training/requirements.txt
```

Ultralytics installs the training stack, including PyTorch. For NVIDIA training,
install a PyTorch build compatible with your GPU/driver if the installed build
does not support CUDA. Training does not need the app's S3 credentials or API keys.
The first run may download the selected pretrained weights.

## Put your labeled files here

Use your existing **YOLO detection** export's data.yaml. Images alone cannot train
a detector: each labeled image needs a matching YOLO text label. For example:

```text
datasets/my-items/
  data.yaml
  images/train/scene001.jpg
  images/val/scene002.jpg
  images/test/scene003.jpg
  labels/train/scene001.txt
  labels/val/scene002.txt
  labels/test/scene003.txt
```

Example data.yaml (replace the absolute root and example names with your data):

```yaml
path: /home/raymond/datasets/my-items
train: images/train
val: images/val
test: images/test
names:
  0: keys
  1: wallet
```

Each label row is `class_id center_x center_y width height`, with coordinates
normalized to 0–1. The class ID indexes `names`; preserve your export's existing
mapping. Exact class names become detection labels and must match requested
target names. `phone` and `cell phone` are different names to the worker.

Exports with a different split layout also work: retain their YAML and make sure
its paths resolve to your images. An absolute `path` avoids working-directory
ambiguity. Split by scene/session so near-duplicate images do not leak into
validation or test sets. Keep a held-out test split for evaluation.
`datasets/`, `runs/`, and weight files are git-ignored.

## Train

```bash
python training/train.py --data /home/raymond/datasets/my-items/data.yaml
```

Defaults: YOLO11n starting weights, 100 epochs, 640-pixel images, batch size 16,
automatic device selection, and output under `<repo>/runs/detect/ctrlf/`.
Choose hardware explicitly when needed. For an NVIDIA CUDA GPU:

```bash
python training/train.py \
  --data /home/raymond/datasets/my-items/data.yaml \
  --model yolo11n.pt --epochs 100 --imgsz 640 --batch 8 \
  --device 0 --project runs/detect --name ctrlf-v1
```

Use `--device cpu` for CPU training (substantially slower). Reduce `--batch` if GPU
memory runs out. Choose the training machine yourself; the same CLI can run on a
local machine or a cloud host. `--model` can also name existing compatible custom
weights for further fine-tuning. Numeric settings must be positive integers.

Existing run directories are preserved; a repeated name gets a new numbered
directory. On success the script prints the actual absolute `weights/best.pt`
path and a quoted `.env` assignment. It does not edit desktop configuration.

```bash
python training/train.py --help
```

## Evaluate and deploy

Use the **actual path printed by training** below. The dataset must have `test`
configured to evaluate the held-out split:

```bash
yolo detect val model=/absolute/path/to/weights/best.pt \
  data=/home/raymond/datasets/my-items/data.yaml split=test
yolo detect predict model=/absolute/path/to/weights/best.pt \
  source=/absolute/path/to/a/new-pi-photo.jpg save=True
python -m pip show ultralytics torch
```

Record mAP50, per-class recall, library versions, dataset snapshot, and training
settings with the model version. Inspect the predicted labels and boxes; compare
against the prior model on the same held-out images. See
[the training plan](../docs/TRAINING.md#deploy-as-raymond) for Raymond's deployment,
restart, class-list integration, and rollback instructions.

These are operator checks; a real training run needs your dataset and chosen
hardware. No real model quality or GPU compatibility is established by the offline
tests.

## Offline tests

```bash
python -m pytest training/tests -q
```

Tests stub the model and trainer and require no images, model downloads, GPU,
storage, or paid APIs. `--help` works even without Ultralytics installed.

API reference: [Ultralytics training configuration](https://docs.ultralytics.com/usage/cfg/)
and [Python model API](https://docs.ultralytics.com/reference/engine/model/).
