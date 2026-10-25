## Context
Desktop writes rectangles into results/<id>_result.jpg. SnapshotFrame draws the brass target circle as a separate SVG overlay. Current S3 and Postgres readers prefer annotated keys.

## Goals / Non-Goals
Use original pixels behind the existing target circle, for current and last-seen evidence. Preserve detection facts, history cutoff, private signed URLs and completion ordering. No inference change or new image rendering.

## Decisions
Centralize S3 result-to-raw-key selection: source=device results use incoming/device/<id>.jpeg, while browser and legacy HTTP results use incoming/<id>.jpg. The ready-only worker already publishes source=device; legacy HTTP results omit it. Postgres and historical evidence directly supply the exact original s3_key. Use those originals in all snapshot/photo representations and preserve geometry/dimensions. Do not fall back to annotated files and reintroduce the clutter. Annotated results still exist for the unchanged completion protocol and diagnostics.

## Risks / Trade-offs
Originals must remain retained/readable in private storage for historical display. A deleted original cannot be reconstructed by removing baked-in rectangles. Existing S3 credentials already read incoming/.

## Migration Plan
No data migration. Implement, run Playwright desktop/mobile plus TypeScript/lint, commit/push feature branch for review. Desktop/Pi remain unchanged; rollback is switching web back to dev.

## Open Questions
None blocking. The current single-primary-target circle remains as requested.
