# YOLO training

Plan and rationale: [docs/TRAINING.md](../docs/TRAINING.md). Datasets and weights are never committed (`training/datasets/`, `runs/`, `*.pt` are git-ignored).

## Steps

1. **Environment.** Python 3.11 or 3.12 venv, then `pip install ultralytics`. `pip install -r requirements.txt` gives CPU-only PyTorch on Windows. For an NVIDIA GPU, install the CUDA build of PyTorch from pytorch.org first. Check the GPU with `python -c "import torch; print(torch.cuda.is_available())"`.
2. **Collect photos.** `python training/collect.py keys` (space saves, q quits). Repeat per class in `data.yaml`. Vary lighting, position, clutter. Aim for 150+ photos per class, shot with the camera used at inference.
3. **Label.** Draw boxes in Roboflow, CVAT, or Label Studio. Export in YOLO format into `training/datasets/ctrlf/` as `images/{train,val,test}` and `labels/{train,val,test}`. Split by scene or session, not randomly per photo.
4. **Train.** `python training/train.py`
5. **Evaluate.** `python training/eval.py runs/ctrlf/ctrlf/weights/best.pt` (target: recall >= 0.80 per class).
6. **Deploy.** Upload `best.pt` to storage under `models/<version>/best.pt`, then set `YOLO_WEIGHTS_PATH`.

## Small lost items (free dataset) and a Raspberry Pi sized model

The target is small things people lose, never large appliances. `prepare_openimages.py` builds a dataset from Open Images V7 (CC BY images only): phone, glasses, remote, watch, headphones. Open Images has no keys, wallet, wires, AirPods, or AirPods case, so those need other data (the Roboflow Universe AirPods sets, the LeftInCAR dataset on Mendeley, or your own photos from `training/collect.py`).

```bash
python training/prepare_openimages.py
python training/train.py --data training/personal.yaml --model yolo11n.pt --epochs 80 --imgsz 640 --device 0 --name small-items
python training/eval.py runs/small-items/weights/best.pt --data training/personal.yaml
python training/report.py runs/small-items/weights/best.pt --data training/personal.yaml --device 0
python training/export.py runs/small-items/weights/best.pt --imgsz 416
```

`yolo11n` (the nano size) is the model to run on a Raspberry Pi 4B. `export.py` converts it to NCNN, the fastest CPU format on a Pi, and times it on this machine. Copy the exported folder to the Pi to measure real speed.

Licensing notes for the data and for Ultralytics are in [docs/LICENSES.md](../docs/LICENSES.md).

To add an item, append it to `names` in `data.yaml`, collect and label it, and retrain.
