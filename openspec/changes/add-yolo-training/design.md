# Design

## Context

See proposal.md for motivation. desktop/server.py loads YOLO_WEIGHTS_PATH once at startup and otherwise falls back to yolov8n.pt. docs/TRAINING.md describes YOLO11 training but training/ does not exist. The worker matches target strings exactly. Existing ignore rules exclude datasets/, runs/, and *.pt.

## Goals / Non-Goals

**Goals:** A thin CLI runnable from the repo root or another working directory; deployment instructions for raymond; offline verification of argument handling and artifact reporting.

**Non-Goals:** Training services, automatic dataset conversion, automatic model promotion, website edits, or choosing classes and hardware.

## Decisions

- Add training/train.py using argparse and a lazy Ultralytics import. Accept --data (required), --model (default yolo11n.pt per the existing training plan), --epochs (100), --imgsz (640), --batch (16), --device (optional), --project (repo-root runs/detect), and --name (ctrlf). Explicit device selection keeps local GPU versus cloud an operator decision. A direct CLI gives clearer validation and deployment output than a shell alias.
- Use the supplied data.yaml directly. Do not create a fixed class list or move the dataset. Resolve the CLI dataset path absolutely while leaving dataset-relative paths to Ultralytics. Document a valid dataset-root path and matching images/labels layout. Delegate detailed dataset validation to Ultralytics rather than duplicating its schema.
- Call YOLO(model).train with save=True and exist_ok=False. Resolve the best weights from the trainer's actual save directory, verify the file, and print its absolute path and environment assignment. Avoid assuming the requested directory is the final directory when runs are numbered.
- Keep the existing inference loader unchanged. Document copying weights to /home/raymond/models/ctrlf-v1/best.pt, setting YOLO_WEIGHTS_PATH, ensuring raymond can read it, and restarting the worker. No edits to Raymond's home or credentials occur in this change.
- Use pytest with a fake model/trainer and temporary files. No GPU, downloads, S3, or paid APIs in tests. Provide a real training/evaluation manual check for the operator rather than launching an expensive run without their dataset and device choice.

## Risks / Trade-offs

- [Dataset quality controls detection quality] → Document split leakage, held-out evaluation, and class-name alignment.
- [Training can require substantial compute] → Expose device and batch controls and document CPU feasibility and GPU selection without choosing a host.
- [Installed Ultralytics versions vary] → Use its public training API and record the installed version with a real run; mock tests do not establish GPU compatibility.
- [Web may retain an old class list] → Document current known-field discovery limitation and matching names; changing that behavior belongs to a separate change.

## Migration Plan

Install training requirements into a virtual environment, supply a labeled dataset YAML, train and evaluate, then explicitly set the worker's existing environment variable under raymond and restart. Roll back by restoring the previous weights path and restarting. Prior deployed weights are retained.
