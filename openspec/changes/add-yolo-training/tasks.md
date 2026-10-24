# Tasks

## 1. Training CLI

- [x] 1.1 Add training/train.py with typed public functions, lazy model import, required dataset path, configurable model/epochs/image size/batch/device/project/name, and positive numeric validation; verify --help works without loading weights and pytest covers missing data and invalid arguments before model initialization.
- [x] 1.2 Invoke Ultralytics training with independent run output, propagate actionable dataset/training errors, verify the actual best.pt, and print its absolute path plus YOLO_WEIGHTS_PATH assignment; verify with pytest stubs covering forwarded options, success, numbered run directories, trainer failure, and absent output weights.
- [x] 1.3 Add training/requirements.txt and training/README.md documenting Python 3.11+ virtual environment setup, YOLO images/labels and data.yaml format, class-ID alignment, device choices, command examples, dependencies, held-out evaluation, and artifact locations; verify help/options agree with the CLI and no real training or dataset is committed.

## 2. Desktop handoff documentation

- [x] 2.1 Update docs/TRAINING.md to describe the implemented CLI, held-out evaluation command, and manual verification of detections with new weights; verify commands match the implemented arguments and clearly distinguish optional real training checks from executed checks.
- [x] 2.2 Document deployment as raymond using /home/raymond/models/ctrlf-v1/best.pt, read permissions, existing YOLO_WEIGHTS_PATH, environment precedence, restart, exact class-name matching, current web class-discovery limitation, and rollback; verify against desktop/server.py and web/lib/data/s3-store.ts without accessing secrets or writing Raymond's home.
- [x] 2.3 Link the training instructions from README.md and verify the relative link resolves.

## 3. Integration checks

- [x] 3.1 Run the offline training pytest suite, CLI --help, and OpenSpec strict validation; record results and any hardware validation still requiring the operator's dataset/device choice.

## Workflow follow-up

- Archive after implementation is complete and reviewed.

## Verification record

- `python3 -m pytest training/tests -q`: 15 passed (offline stubs).
- `python3 training/train.py --help`: passed without loading model weights.
- `git diff --check`: passed.
- `pnpm dlx @fission-ai/openspec validate add-yolo-training --strict`: passed.
- Real training, held-out metrics, GPU compatibility, and deployment under raymond
  remain operator checks requiring the dataset and selected hardware.
