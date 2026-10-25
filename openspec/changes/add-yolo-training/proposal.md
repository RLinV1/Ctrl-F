> Reconciliation: `replace-yolo-with-hermes` supersedes this change's active
> search-path assumptions about YOLO, browser-only audio, optional sighting memory,
> and device discovery. Keep completed unrelated work and training utilities.
> Do not archive the superseded search contracts independently; use the current
> contracts and reconciliation map in `replace-yolo-with-hermes/design.md`.

# Proposal

## Why

Ctrl-F can load custom weights, but has no executable training workflow. Users need to turn their labeled YOLO dataset into weights that Raymond can run on this PC, supporting PRD F4 and F5.

## What Changes

- Add a Python CLI accepting an existing detection dataset's data.yaml and configurable training settings.
- Produce best.pt, report its absolute path, and show how to configure YOLO_WEIGHTS_PATH.
- Document dataset placement, environment setup, evaluation, and deployment under raymond.
- Add offline pytest coverage with a stub trainer.

## Capabilities

### New Capabilities

- `model-training`: Train custom detection weights from a labeled dataset and report the deployment artifact.

### Modified Capabilities

None.

## Impact

Adds training/ and updates docs/TRAINING.md and README.md. Reuses Ultralytics; no website, inference contract, or credential changes. desktop/server.py already accepts YOLO_WEIGHTS_PATH.

## Non-goals

Labeling images, choosing item classes or training hardware for the user, launching a real training run, automatic deployment, changing target extraction, and changing the desktop polling pipeline.
