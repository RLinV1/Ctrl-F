## 1. Setup

- [x] 1.1 Add `sqlalchemy`, `alembic`, and `psycopg[binary]` to `desktop/requirements.txt`, and `pytest` to `desktop/requirements-dev.txt`

## 2. Schema

- [x] 2.1 Write the SQLAlchemy models for `items`, `photos`, `detections`, `zones`, `jobs`, and `device_heartbeats` in `desktop/ctrlf_db/models.py`, plus an engine helper in `session.py`
- [x] 2.2 Write Alembic config and migration `0001_initial`. Verify `upgrade head`, `downgrade base`, and `upgrade head` on a test database, and check that the models and the migration match (autogenerate finds no differences)

## 3. Write path

- [x] 3.1 Port the zone geometry (`anchor`, `point_in_polygon`, `assign_zone`) to `desktop/ctrlf_db/zones.py`. Verify with pure pytest tests
- [x] 3.2 Implement `save_result` in `desktop/ctrlf_db/repo.py` (job upsert, idempotent photo insert, detections with items and zones, guarded last-location update, lost count). Verify with pytest against a test database covering: two items in one photo, an untracked label, a newer and an older photo, a missing target, and reprocessing
- [x] 3.3 Add a seed command `python -m ctrlf_db.seed <names...>` / `--from-model`
- [x] 3.4 Call `save_result` from `desktop/server.py` when `DATABASE_URL` is set; log and continue on errors

## 4. Docs

- [x] 4.1 Update the data model in `docs/ARCHITECTURE.md`, the ORM row in `docs/TECH_STACK.md`, and the desktop run steps in `README.md`
