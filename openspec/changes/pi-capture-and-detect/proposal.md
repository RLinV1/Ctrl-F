> Reconciliation: `replace-yolo-with-hermes` supersedes this change's active
> search-path assumptions about YOLO, browser-only audio, optional sighting memory,
> and device discovery. Keep completed unrelated work and training utilities.
> Do not archive the superseded search contracts independently; use the current
> contracts and reconciliation map in `replace-yolo-with-hermes/design.md`.

## Why

Ctrl-F cannot do anything until a photo from the Raspberry Pi can be turned into object detections on the desktop. This is the first vertical slice (milestone M1): it proves the camera, the network hop and the custom YOLO model work together before voice, storage, and the web UI are built on top.

## What Changes

- Add a Pi service that returns a JPEG frame on demand and reports health.
- Add a desktop service that accepts a JPEG, runs the YOLO model, and returns detections (`label`, `confidence`, `bbox`).
- Add a target-matching module that decides whether a requested item is among the detections.
- Add a small Pi-side relay script that captures a frame and posts it to the desktop (the relay role the Pi will keep in later milestones). Job polling is out of scope here.
- Add a developer check: run the relay once, print detections for a target.

Implements PRD F3, F4, F5.

## Non-goals

- Voice: no microphone, STT, narrator, or TTS (M2).
- Web UI, job queue, `/api/jobs/next` polling (M2 and M4).
- Postgres, object storage, sighting history, lost counts (M3).
- Training the model. M1 runs whatever weights `YOLO_WEIGHTS_PATH` points to; a pretrained COCO model is enough to prove the pipeline. Custom training is planned in `docs/TRAINING.md`.
- Periodic scanning.

## Capabilities

### New Capabilities
- `pi-camera-capture`: Pi service endpoints `/capture` and `/health`, plus the relay script that forwards a frame to the desktop.
- `object-detection`: Desktop `/detect` endpoint that runs the configured YOLO weights on an uploaded JPEG and returns detections, plus `/health` with model version.
- `target-matching`: Matching a requested item name (or alias) against a detection list.

### Modified Capabilities
<!-- None. openspec/specs/ is empty. -->

## Impact

- New directories: `pi/`, `desktop/`.
- New dependencies: Pi side `picamera2` (or OpenCV) and a small HTTP framework; desktop side `fastapi`, `uvicorn`, `ultralytics`, `python-multipart`.
- New env vars: `DESKTOP_BASE_URL`, `YOLO_WEIGHTS_PATH` (see `docs/TECH_STACK.md`).
- No changes to `docs/` contracts beyond what is already in `docs/ARCHITECTURE.md`.
