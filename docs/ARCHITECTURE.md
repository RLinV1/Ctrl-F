# Architecture

## Summary

The website is the voice interface: the browser records the user's microphone and plays the reply. The Raspberry Pi takes photos and relays each request to the desktop. The desktop runs the models. Vercel never calls the Pi or the desktop.

```
 Browser (user)        Vercel + Cloud                      Pi (edge)              Desktop (brain)
 --------------        --------------                      ---------              ---------------
 mic -> audio  ---->   /api/jobs  -> jobs row + R2 audio
                                          ^   |
                                          |   +-- Pi polls /api/jobs/next (outbound HTTPS)
                                          |                 camera -> JPEG
                                          |                 POST photo + job_id --LAN--> /process
                                          |                                              STT (ElevenLabs)
                                          |                                              target, YOLO, match, memory
                                          |                                              Gemini steampunk narrator
                                          +---- writes sightings, reply, audio <-------- TTS (ElevenLabs)
 speaker <---- polls /api/jobs/:id -> reply text + signed audio URL
```

## Design rules

- **Browser owns audio I/O.** It records with `MediaRecorder` and plays the reply audio. The Pi has no microphone.
- **Pi is the camera and the relay.** It claims a job, captures a photo, and forwards photo + job id to the desktop on the LAN. It runs no models.
- **Desktop owns all intelligence.** STT, target extraction, YOLO, matching, memory, narrator, TTS. It writes results to Postgres and R2 directly.
- **Vercel never calls the Pi or desktop.** The Pi and desktop make outbound calls only. The job table in Postgres is the hand-off between the web and the Pi.
- **One job = one voice request.** Status moves `pending -> claimed -> done | failed`.
- **Storage uses the S3 API only**, so R2 can be swapped for SeaweedFS.
- **Memory is plain SQL.** Last seen = `items.last_seen_at` / `last_zone_id` / `last_photo_id` (a cached copy of the newest detection). Lost count = `items.lost_count`. No vector DB.
- **Periodic scans** (optional, M5) are a desktop scheduler calling the same detect-and-store function.
- **Network:** Pi and desktop share a LAN. If not, use Tailscale. Do not open inbound ports.

## Request flow (voice query)

1. User holds push-to-talk on the website. Browser records audio.
2. Browser uploads the clip to R2 (presigned URL) and calls `POST /api/jobs`, which creates a `jobs` row with `status = pending`.
3. Pi polls `GET /api/jobs/next` with its bearer token. It receives one job and marks it `claimed`.
4. Pi captures a JPEG and sends it with the job id to the desktop: `POST {DESKTOP_BASE_URL}/process`.
5. Desktop downloads the audio, calls ElevenLabs STT, and reduces the transcript to a target item name by matching it against the trained class list. No LLM.
6. Desktop runs the custom-trained YOLO model on the JPEG and matches the target to detections.
7. Desktop stores the JPEG and inserts a `photos` row plus one `detections` row per box, and updates each found item's last location. If the target was not found, it increments `items.lost_count`.
8. Gemini, as a witty steampunk narrator, writes a one or two sentence reply. ElevenLabs TTS turns it into audio stored in R2.
9. Desktop updates the job: `status = done`, `reply_text`, `reply_audio_key`.
10. Browser polls `GET /api/jobs/:id`, shows the reply, and plays the audio from a signed URL.

## Data model (Postgres)

Owned by `desktop/`: SQLAlchemy models in `desktop/ctrlf_db/models.py`, Alembic migrations in `desktop/migrations/`. Every table has a UUID primary key (`gen_random_uuid()`). Media stays in S3, and rows store the object key, never a URL (photos are private, so readers sign the key when they show it).

```
items                      -- a tracked thing
  id             uuid pk
  name           text unique       -- lowercase, matches a model class ("keys")
  aliases        text[]
  lost_count     int default 0
  last_zone_id   uuid fk zones null    -- last location
  last_seen_at   timestamptz null
  last_photo_id  uuid fk photos null
  created_at     timestamptz

photos                     -- one camera photo
  id             uuid pk
  s3_key         text unique       -- incoming/<job>.jpg
  annotated_key  text null         -- results/<job>_result.jpg (boxes drawn)
  taken_at       timestamptz       -- S3 upload time until the Pi sends its capture time
  width, height  int
  model_version  text null
  job_id         uuid fk jobs null
  created_at     timestamptz

detections                 -- join table: which items each photo shows
  id             uuid pk
  photo_id       uuid fk photos (cascade)
  item_id        uuid fk items null    -- null for classes we don't track
  label          text
  confidence     real
  bbox           jsonb             -- {x, y, w, h} normalized 0..1
  zone_id        uuid fk zones null
  seen_at        timestamptz       -- copy of photos.taken_at
  index (item_id, seen_at desc)

zones                      -- named areas of the fixed camera view
  id             uuid pk
  name           text unique       -- "desk", "couch"
  polygon        jsonb             -- [[x, y], ...] normalized 0..1
  created_at     timestamptz

jobs                       -- one voice request (replaces the earlier queries draft)
  id               uuid pk         -- the id in jobs/<id>.json and incoming/<id>.jpg
  status           text            -- pending | claimed | done | failed
  audio_key        text null
  transcript       text null
  targets          text[]
  found            boolean null
  corrected        boolean default false
  reply_text       text null
  reply_audio_key  text null
  reply_timings    jsonb null      -- [{word, start, end}]
  error            text null
  created_at, claimed_at, finished_at  timestamptz
  index (status, created_at)

device_heartbeats
  device         text pk           -- pi | desktop
  last_seen_at   timestamptz
```

Rules:
- A detection's zone is the first zone (by `created_at`, then `name`) containing the bottom-centre of its box.
- An item's `last_*` columns change only when a photo is newer than `last_seen_at`, so photos processed out of order can't move an item back in time. When one photo shows an item twice, the most confident box wins.
- Each requested target that's tracked but not detected adds 1 to its `lost_count`. Reprocessing a stored `s3_key` changes nothing.
- Derived (not stored): lost frequency over time (count of `jobs` with `found = false` per target).

## Interfaces

### Pi service

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/capture` | `image/jpeg` of the current frame (debug and M1) |
| GET | `/health` | `{ "ok": true }` |
| (loop) | outbound | Polls `GET {WEB_BASE_URL}/api/jobs/next`, captures, forwards to desktop |

### Desktop service

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/detect` | JPEG upload | `{ detections: [{ label, confidence, bbox }] }` (M1) |
| POST | `/process` | JPEG + `job_id` | `202`; the job row carries the result |
| POST | `/scan` | none | Capture-free detect and store for periodic mode (M5) |
| GET | `/health` | none | `{ "ok": true, "gpu": bool, "model_version": "..." }` |

### Web (Next.js)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/jobs` | UI login | Create a job, return presigned audio upload URL |
| GET | `/api/jobs/next` | Pi bearer token | Pi claims the oldest pending job |
| GET | `/api/jobs/:id` | UI login | Status, reply text, signed reply-audio URL |
| GET | `/api/items` | UI login | Items with last seen and lost count |
| GET | `/api/items/:id/sightings` | UI login | History with signed snapshot URLs |

These are proposals. Change them while building, and update this file in the same commit.

## Model

- Custom-trained YOLO, see `docs/TRAINING.md`. Only trained classes can be found.
- Weights live in object storage under `models/<version>/best.pt`. `YOLO_WEIGHTS_PATH` selects the version.
- Matching logic lives in one module in `desktop/`.

## Security

- Snapshots and audio are private (photos and voice from a home). The UI needs a single-user login. All media uses short-lived signed URLs.
- The Pi token can only claim jobs. The desktop has its own read-write database role. Vercel's role can write `jobs` and read everything else.
- No credentials in the repo. Env var names are in `docs/TECH_STACK.md`.
- The desktop and Pi are not exposed to the public internet.

## Failure behavior

- Pi offline: the job stays `pending`; the UI shows "camera offline" after a timeout and the last seen sighting.
- Desktop offline: the Pi marks the job `failed` after a timeout; the UI still shows history.
- Untrained item requested: the narrator says it cannot look for that yet.
- STT or TTS fails: the job completes with `reply_text` only.

## Dev pipeline (branch `dev`, S3 only, everything polls)

The web app skips Postgres (the desktop can write to it, see step 3). One bucket holds jobs, photos and results; the web server does STT, narration and TTS. Nothing calls the web app but the browser. The web app's S3 credentials are narrow: list and read `incoming/` and `results/`, write and delete `jobs/`. No audio is stored.

1. Browser records and `POST /api/jobs` sends the recording as the request body. The web server runs ElevenLabs STT and Gemini item picking, drops the audio, and writes `jobs/<id>.json` (`{"text", "targets"}`).
2. The Pi (`dev-test/pi_capture.py` on main) polls `jobs/`, deletes the job to claim it, photographs, and uploads `incoming/<id>.json` (a copy of the job) then `incoming/<id>.jpg`.
3. The processing server (`desktop/server.py`) polls `incoming/`, runs YOLO and writes `results/<id>_result.json` then `results/<id>_result.jpg`. It may touch `results/heartbeat` for the Desktop light. Button-press training photos (`pi/capture.py`) go to `incoming/training/<name>.jpg` instead; the processing server skips that prefix.
4. The browser polls `GET /api/jobs/<id>`. The web server sees `incoming/<id>.*` (job claimed) and then both result files, has Gemini word the reply from the result JSON, and has ElevenLabs speak it (held in web server memory, served at `/api/jobs/<id>/audio`, with word timings).

Job state lives in web server memory, so a restart forgets jobs in flight. The Items, History and Results screens are derived from the newest 60 `results/*.json` files, so they survive restarts (older results show no question or reply text). Device lights: Camera is the newest `incoming/` upload, Desktop is the newest result or `results/heartbeat`.  Every request, even one that names no known item, goes to the Pi; the processing server reports `no_target` and the narrator asks what to look for.
