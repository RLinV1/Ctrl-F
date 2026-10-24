# Architecture

## Components

```
 [User voice]
      |
      v
 [Raspberry Pi]  mic + camera
      |  audio / JPEG over LAN (HTTP)
      v
 [Desktop service, Python]  STT -> Gemini parse -> YOLO -> match -> Gemini reply -> TTS
      |                         |
      | HTTPS (secret)          | SQL + S3 API
      v                         v
 [Next.js on Vercel] <------ [Postgres + object storage]
      |
      v
 [Web UI: items, snapshots, history]
```

The desktop is the orchestrator. The web app is a viewer plus a thin API. Vercel never calls the desktop.

## Request flow (voice query)

1. Audio is captured (Pi or desktop mic) and sent to the desktop.
2. Desktop calls ElevenLabs STT, then Gemini to extract `{ "target": "<canonical item name>" }`.
3. Desktop calls `GET {PI_BASE_URL}/capture` and receives a JPEG.
4. Desktop runs detection on the JPEG. Output: list of `{ label, confidence, bbox }`.
5. Desktop matches `target` to detections (exact label, synonym, or open-vocabulary prompt). If nothing matches and the vision fallback is on, ask Gemini vision.
6. Desktop uploads the JPEG to storage and inserts a `sightings` row (always, for every capture). Matched detections are linked to the item.
7. If the target was not found, the desktop looks up the last sighting for that item and increments `items.lost_count`.
8. Gemini writes a one or two sentence reply from the structured result. ElevenLabs TTS speaks it.
9. Desktop POSTs a summary to the web API so the UI refreshes (or the UI reads Postgres directly).

## Data model (Postgres)

```
items
  id            uuid pk
  name          text unique        -- canonical, lowercase ("keys")
  aliases       text[]             -- synonyms ("key", "car keys")
  lost_count    int default 0
  created_at    timestamptz

snapshots
  id            uuid pk
  storage_key   text               -- object key in the bucket
  captured_at   timestamptz
  width, height int

sightings
  id            uuid pk
  item_id       uuid fk items
  snapshot_id   uuid fk snapshots
  label         text               -- raw detector label
  confidence    real
  bbox          jsonb              -- {x, y, w, h} normalized 0..1
  seen_at       timestamptz

queries
  id            uuid pk
  transcript    text
  target        text
  item_id       uuid fk items null
  found         boolean
  asked_at      timestamptz
```

Derived values (do not store):
- Last seen of an item = newest `sightings` row for it.
- Lost frequency = `items.lost_count`, or count of `queries` with `found = false`.

## API contracts

### Pi service

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/capture` | `image/jpeg` of the current frame |
| GET | `/health` | `{ "ok": true }` |

### Desktop service

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/query` | audio file, or `{ "text": "find my keys" }` | `{ target, found, bbox?, snapshot_url, last_seen?, reply_text, reply_audio_url }` |
| POST | `/scan` | none | Captures, detects, stores all detections (periodic mode) |
| GET | `/health` | none | `{ "ok": true, "gpu": bool }` |

### Web API (Next.js route handlers)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/ingest` | `Authorization: Bearer $DESKTOP_TO_WEB_SECRET` | Desktop pushes a query result |
| GET | `/api/items` | none (v1) | List items with last seen and lost count |
| GET | `/api/items/:id/sightings` | none (v1) | Sighting history with signed snapshot URLs |

These are proposals. Change them freely while building, and update this file in the same commit.

## Detection note

Stock YOLO uses the COCO classes. Common lost items (keys, wallet, earbuds) are not COCO classes. Use YOLO-World with the target as the text prompt, fine-tune, or use the Gemini vision fallback. Matching logic lives in one module in `desktop/` so the strategy can change without touching callers.

## Security

- Snapshots are private. The UI uses short-lived signed URLs.
- `/api/ingest` requires the shared secret.
- No credentials in the repo. See `docs/TECH_STACK.md` for env var names.
- The desktop and Pi are not exposed to the public internet.
