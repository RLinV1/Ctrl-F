# YOLO training

Plan and rationale: [docs/TRAINING.md](../docs/TRAINING.md). Datasets and weights are never committed (`datasets/`, `runs/`, `*.pt` are git-ignored).

## Steps

1. **Environment.** Python 3.11 or 3.12 venv, then `pip install ultralytics`. Check the GPU with `python -c "import torch; print(torch.cuda.is_available())"`.
2. **Collect photos.** `python training/collect.py keys` (space saves, q quits). Repeat per class in `data.yaml`. Vary lighting, position, clutter. Aim for 150+ photos per class, shot with the camera used at inference.
3. **Label.** Draw boxes in Roboflow, CVAT, or Label Studio. Export in YOLO format into `datasets/ctrlf/` as `images/{train,val,test}` and `labels/{train,val,test}`. Split by scene or session, not randomly per photo.
4. **Train.** `python training/train.py`
5. **Evaluate.** `python training/eval.py runs/ctrlf/ctrlf/weights/best.pt` (target: recall >= 0.80 per class).
6. **Deploy.** Upload `best.pt` to storage under `models/<version>/best.pt`, then set `YOLO_WEIGHTS_PATH`.

To add an item, append it to `names` in `data.yaml`, collect and label it, and retrain.
