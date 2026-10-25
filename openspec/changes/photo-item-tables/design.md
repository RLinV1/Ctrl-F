## Context

`desktop/server.py` polls `incoming/` in S3, runs YOLO, and writes `results/<id>_result.json` and `results/<id>_result.jpg`. `<id>` is the web job's UUID. The web app reads only S3. There's a Postgres container in `docker-compose.yml`, and `DATABASE_URL` is already in `.env.example`, but no code uses it on `dev`.

## Goals / Non-Goals

Goals: lasting storage for items, photos, and which items each photo showed, with a last location per item, written by the desktop. Non-goals: see the proposal.

## Decisions

**1. Photos link to items through `detections`.** A photo can show several items, and an item appears in many photos, so `photos` has no item column. Each detection row is one box: `photo_id`, `item_id` (null when the label isn't tracked), `label`, `confidence`, `bbox`, `zone_id`. Untracked boxes are kept so that adding an item later doesn't need the photos run again.

**2. Store S3 keys, not URLs.** Photos are private, and signed URLs expire. Whoever shows a photo signs `photos.s3_key` at read time, and keys survive a change of bucket or endpoint.

**3. Last location is cached on `items`.** `last_zone_id`, `last_seen_at`, and `last_photo_id` copy the newest detection of that item. They're written in the same transaction as the detection, guarded by `last_seen_at IS NULL OR last_seen_at < taken_at`, so photos processed out of order can't move an item back in time. This reverses the ARCHITECTURE note "last seen is derived, do not store": reading an item's location is the most common query, and the guard keeps the cache correct. When one photo shows an item twice, the box with the highest confidence wins.

**4. Location means a zone.** `zones` holds named polygons (0..1 coordinates) over the fixed camera view. A box's bottom-centre point picks the zone, because that's where an object rests on a surface. The geometry is the pure function written for the earlier zone-locations work, and no model is involved. With no zones defined, `zone_id` stays null.

**5. `detections.seen_at` copies `photos.taken_at`.** This lets the history query use the index `(item_id, seen_at desc)` without a join.

**6. `jobs` absorbs `queries`.** One voice request is one row (`transcript`, `targets`, `found`, `reply_text`, `corrected`), and the columns in `web-ui` Decision 4 are kept (`audio_key`, `reply_audio_key`, `reply_timings`, `status`, timestamps, index `(status, created_at)`). `audio_key` is nullable, because the current S3 flow has no stored audio for the desktop to name. A photo points to its job (`photos.job_id`), not the other way round, since periodic scans have photos without jobs. The matched box for a job is the detection in its photo whose item is the target.

**7. Sync SQLAlchemy 2 plus psycopg 3, and Alembic.** The server is a blocking poll loop, so async gains nothing. The models are the single source of truth, and the hand-written migration matches them.

**8. Table order.** `items` points to `photos` (`last_photo_id`) and `zones`, and `photos` points only to `jobs`, so there's no cycle. The migration creates `zones, jobs, photos, items, detections, device_heartbeats` in that order.

**9. Idempotent writes.** `photos.s3_key` is unique. If the insert hits an existing key, `save_result` returns that photo and changes nothing else, so a reprocessed photo doesn't double-count `lost_count`.

**10. Database writes never break the S3 flow.** `server.py` calls the store only when `DATABASE_URL` is set, after the S3 results are written. A database error is logged, and the loop continues.

## Risks / Trade-offs

- **Upload time stands in for the time taken.** S3 `LastModified` is set when the Pi's upload finishes, usually under a second after capture. A follow-up can send a `captured_at` from the Pi.
- **Cache drift.** If a photo row is deleted, `last_photo_id` is set to null, but `last_seen_at` and `last_zone_id` stay. That's acceptable, because photos aren't deleted in v1.
- **The `feat/backend-foundation` schema conflicts with this one.** Local databases migrated by it must be reset (`alembic downgrade base` on that branch, or drop and recreate the database).

## Migration Plan

1. `docker compose up -d postgres`
2. `cd desktop && alembic upgrade head`
3. `python -m ctrlf_db.seed keys wallet ...` (or `--from-model`)
4. Rollback: `alembic downgrade base` drops every table this change added.
