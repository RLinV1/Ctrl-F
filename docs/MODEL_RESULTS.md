# Model results

Scored on photos that were never trained on (`python training/eval.py <best.pt> --frozen [fourth_model]`). Numbers are mAP50 and per-class recall. The target from `docs/PRD.md` is recall of at least 0.80 per class. Run on 2026-10-24.

The test sets are small (90 photos, and 323 for the second set, with some classes at 3 to 20 photos), so a difference of a few points is noise. Treat the table as a direction, not a verdict.

## Frozen test set 1 (90 photos, from when model 2 was trained)

| Class | Model 2 (yolo26n) | Model 3 (yolo26n) | Model 4 (yolo26s) |
| --- | --- | --- | --- |
| mAP50 overall | 0.841 | 0.889 | **0.895** |
| remote (3 photos) | 0.60 | 0.89 | 0.71 |
| headphones (37) | 0.88 | 0.79 | 0.74 |
| keys (20) | 1.00 | 1.00 | 1.00 |
| wallet (20) | 0.88 | 0.82 | 0.90 |
| airpods case (10) | 1.00 | 1.00 | 1.00 |
| airpods (7) | 0.64 | 0.64 | 0.82 |

## Frozen test set 2 (`frozen_test/fourth_model`, 323 photos held out from the Fourth Model datasets)

Models 2 and 3 never saw watches, glasses or most of these sources, so their scores here only show what model 4 added, not that they are worse models.

| Class | Model 2 | Model 3 | Model 4 |
| --- | --- | --- | --- |
| mAP50 overall | 0.129 | 0.151 | **0.904** |
| glasses (11 photos) | 0.00 | 0.00 | 0.91 |
| watch (61) | 0.00 | 0.00 | 0.77 |
| keys (45) | 0.02 | 0.02 | 0.93 |
| charger (87) | n/a | 0.37 | 0.87 |
| headphones (96) | 0.46 | 0.34 | 0.63 |
| remote (18) | 0.42 | 0.38 | 0.89 |
| airpods (5) | 0.11 | 0.00 | 1.00 |

## What this says

- Model 4 is the best overall and the only one that covers all nine classes (it adds watch, glasses and charger).
- **Headphones are still the weak class** (0.74 on set 1, 0.63 on set 2). Most public headphone photos show them worn or in product shots, not lying in a messy room. Photos of your own headphones on desks and couches will help most.
- **Watch** is just under the target (0.77). **Remote** dropped from model 3 on set 1 (0.89 to 0.71), but that set has only 3 remote photos, and model 4 scores 0.89 on 18 remote photos in set 2.
- **Glasses** scored 0.91 on 11 photos, but the public glasses data is mostly glasses on faces. Expect it to do worse on glasses lying on a table until you label your own.
- On the earlier messy-room photos, model 4 no longer reports AirPods on a white charger or on a plastic tub, which models 2 and 3 got wrong. That is two examples, not a measurement.

## Next steps that would move the numbers

1. Photograph and label your own headphones, glasses, watch and remote in your real rooms (Label photos tab, then `python training/import_own.py`).
2. Add photos of cluttered desks with none of the items, as negatives.
3. Retrain with `python training/train.py --data training/personal.yaml --model weights/yolo26s.pt --epochs 60 --patience 20 --device 0 --name small-items-5`.
