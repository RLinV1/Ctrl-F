## Why

The desktop (`desktop/server.py`) runs YOLO on each Pi photo but keeps the result only as JSON in S3 (`results/<id>_result.json`). Nothing goes into Postgres, so Ctrl-F can't answer "where did I last see it?" from lasting history, can't count how often an item gets lost, and has no table for the web app to read later.

## What Changes

- Add a Postgres schema owned by `desktop/` (SQLAlchemy 2 models, Alembic migration `0001`). Every table has a UUID primary key.
  - `items`: tracked things, with `name`, `aliases`, `lost_count`, and the cached last location (`last_zone_id`, `last_seen_at`, `last_photo_id`).
  - `photos`: one row per camera photo. It stores the S3 key (not a URL), the annotated-image key, the time the photo was taken, its size, the model version, and the job it answers.
  - `detections`: the join table between photos and items. It holds every box YOLO found, with label, confidence, box, zone, and the item it matched (null for untracked classes).
  - `zones`: named areas of the fixed camera view (the "location").
  - `jobs`: one voice request (it absorbs the earlier `queries` draft). Its columns follow the `web-ui` design (Decision 4).
  - `device_heartbeats`: the last time the Pi and the desktop were seen (also from the `web-ui` design).
- After its existing S3 writes, the desktop stores each processed photo in one transaction. It saves the photo and its detections, assigns zones, updates each found item's last location (only when the photo is newer), increments `lost_count` for each requested item that wasn't seen, and marks the job done. Without `DATABASE_URL` set, the desktop skips this and behaves as before.
- Add a seed command that creates `items` rows from a list of class names.

Implements PRD F6 (store every capture), F7 (lost count), and the storage half of F8/F9 (last-seen location and history).

## Non-goals

- Switching the web app from S3 JSON to Postgres. The web keeps reading S3, and a later change moves it over.
- Creating or editing zones through an API or UI (insert them with SQL for now).
- Several cameras or rooms.
- Sending a capture time from the Pi. Until it does, the photo's S3 upload time counts as the time it was taken.
- Re-assigning zones on old detections when a zone changes.

## Capabilities

### New Capabilities
- `photo-item-store`: Postgres tables for items, photos, detections, zones, jobs, and device heartbeats, and the desktop's write path for each processed photo.

### Modified Capabilities
<!-- None: openspec/specs/ is empty. -->

## Impact

- Code: new `desktop/ctrlf_db/` package (models, session, repo, zones, seed), `desktop/alembic.ini`, `desktop/migrations/`, `desktop/tests/`, and a small hook in `desktop/server.py`.
- Dependencies: `sqlalchemy`, `alembic`, `psycopg[binary]` (desktop), and `pytest` (desktop dev).
- Env vars: none new (`DATABASE_URL` already exists). An optional `TEST_DATABASE_URL` is used for tests only.
- Docs: data model in `docs/ARCHITECTURE.md`, the ORM row in `docs/TECH_STACK.md`, and the desktop run steps in `README.md`.
- This supersedes the unmerged schema on `feat/backend-foundation` (different table names: `snapshots` becomes `photos`, and `sightings` is folded into `detections`). A database already migrated by that branch must be reset before running this migration.
