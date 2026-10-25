# Architecture

## Active search flow

Ctrl-F has one Pi, one processing worker, one private S3-compatible bucket,
Postgres, a separately configured vision-capable Hermes Agent and one open browser.
The processing worker calls Hermes; the web never calls the Pi or processing host.

```
Browser mic -> web ElevenLabs STT -> S3 jobs/<id>.json -> Pi photo capture
Pi button -> local Ogg recording + fresh JPEG -> S3 audio + photo + ready manifest
                                                    |
                                desktop polls complete incoming requests
                                ElevenLabs STT for Pi recordings
                                Hermes image analysis + Postgres history lookup
                                validated sightings saved in Postgres
                                                    |
                                S3 results/<id>_result.json and _result.jpg
                                                    |
                        web discovers device requests/results through S3
                        Gemini Victorian narration -> ElevenLabs TTS -> browser
```

Pi makes S3 calls only; it needs no web URL/token. Browser recordings retain the
existing web transcription and S3 jobs/ path. Physical-button recordings are
transcribed on desktop. Both paths use the same Hermes, memory and browser reply
experience. Gemini still narrates (with the retained web target-picker fallback);
Hermes does image analysis and restricted memory lookup, not speech transcription.
Pi targets are matched against Postgres canonical names/aliases after STT.

## Component ownership

- `pi/capture.py`: Grove button, voice recorder, serialized camera, S3 queue relay.
- `pi/voice.py`: hold/release ALSA recording, Ogg encoding and local queue callback.
- `desktop/server.py`: polling, error/success completion markers and retry delay.
- `desktop/hermes.py`: authenticated configurable HTTP adapter, schema validation.
- `desktop/processing.py`: all-object observations, history verification, DB save,
  image annotation and versioned results.
- `desktop/memory_server.py`: read-only MCP lookup subprocess on the Hermes host.
- `desktop/ctrlf_db/`: SQLAlchemy schema, repository and seed; Alembic owns migrations.
- `web/lib/data/`: S3 relay/readers, optional Postgres UI reader, narration and voice.

## Storage and schemas

Keep using S3 API access so the storage provider remains swappable. Photos remain
private; rows carry object keys and the web issues signed URLs when displaying
photos. No model/provider secret is sent to the browser or Pi. Source and annotated
photos are retained for historical evidence. Browser request audio is transcribed and discarded by web; Pi recordings remain
private in S3 under operator-controlled retention; reply audio and in-flight web job state are held in web memory.

Postgres tables:

| Table | Stored facts |
| --- | --- |
| `items` | UUID, canonical name, aliases, lost count, last seen time/photo/zone |
| `photos` | UUID, unique S3 key, optional annotated key, UTC capture time, dimensions, model identifier, optional job UUID |
| `detections` | Photo/item links, label, nullable confidence, normalized `{x,y,w,h}`, nullable grounded location description, zone, sighting time |
| `zones` | UUID, name, normalized polygon for fixed camera regions |
| `jobs` | UUID, processing status, transcript/targets, found verdict, optional reply fields and timestamps |
| `device_heartbeats` | Device name and last-seen time (existing schema) |

Apply migration `0002` before deploying the matching readers. Existing scored rows
are unchanged; legacy rows without descriptions use their zone/frame position.
Unknown confidence is not converted to zero or displayed as a percentage.

Application code owns writes. A photo's detections and item updates are committed
transactionally before success publication. Reprocessing a unique photo key never
duplicates sightings or lost counts. On a publication retry, an already persisted
scene is reused. Only a newer positive sighting moves an item's `last_*` fields;
absence preserves its previous location. Highest confidence wins when available;
unscored ties use deterministic geometry. Named zones use the existing
bottom-center-in-polygon rule. Item identity is a canonical category in v1, not an
individual owner's wallet or set of keys.

Hermes's MCP helper uses `MEMORY_DATABASE_URL` with a SELECT-only role and read-only
transactions. Its sole query takes an item UUID and cutoff time and returns the
newest strictly earlier observation, or `never_seen`, or `unavailable`. The worker
checks the agent-returned detection ID against the DB's newest earlier evidence.
Agent conversation/personal memory is not a source of sighting facts.

## S3 result contract

Pi-origin requests use `incoming/device/<uuid>.ogg`, `.jpeg`, and `.ready.json`.
Pi persists a private local queue and captures before network upload. It publishes
the manifest last after both assets upload. The manifest has `version: 1`,
`source: device`, UUID `id`, timezone-aware `created_at`/`captured_at`, exact
`audio_key`/`image_key`, and `audio_content_type: audio/ogg`. Desktop validates the
UUID-scoped keys, checks both asset sizes/existence and transcribes with ElevenLabs.
A committed transcript and targets are reused after retries; incomplete uploads
and STT failure never increment lost counts. `.jpeg` keeps older workers from
processing these requests before upgrade. The worker's STT credential stays on
desktop, never on Pi.

Device result JSON additionally includes `source`, `created_at`, `transcript` and
`targets`. Web reconstructs device jobs from valid ready manifests even after
restart or when the recording arrived before web was deployed. Discovery returns
metadata without waiting for narration; the normal job poll starts Gemini/TTS.
Browser session cursors avoid repeated playback in that session; a fresh session
can discover retained device history. Retention is operator controlled.

Queue metadata is `{text, targets}`; For browser-origin captures Pi adds `captured_at` (UTC ISO timestamp)
before uploading the photo. Existing photos without this use S3 upload time.
Training-only photos remain under `incoming/training/` and are not processed.

Version 2 success JSON retains legacy `status`, `target`, `matches`, `items`,
`detections`, `known`, `width`, and `height`. Each detection has `name`, nullable
`conf`, normalized corner array `box: [x1,y1,x2,y2]`, and `location_description`.
It adds `version: 2`, `captured_at`, `model`, `persisted: true`, `history_status`,
and `last_sighting`, also carried per requested item. History status is
`not_needed`, `available`, `never_seen`, or `unavailable`. Historical evidence
contains stable detection/item/photo IDs, `seen_at`, label, nullable confidence,
normalized `{x,y,w,h}`, location description, zone, private S3 keys and dimensions.

Success requires JSON plus the annotated JPEG (JSON published first). A failure
JSON with `status: failed`, safe `error`, and `persisted: false` is readable without
a JPEG so web stops polling. Failed photos remain retryable, delayed one minute
between attempts. Missing provider output, invalid locations, timeout, or DB save
failure never becomes `not_visible` or a successful remembered result.

## Web API

| Method | Path | Auth / behavior |
| --- | --- | --- |
| POST | `/api/jobs` | UI session if enabled; raw supported audio or JSON `{text}`; returns job |
| POST | `/api/device/jobs` | Legacy compatibility only; the deployed Pi does not call it |
| GET | `/api/jobs/latest?source=device&since=...&afterId=...` | UI; next unpresented job in ascending timestamp/ID order, `{id,createdAt}` or 204 |
| GET | `/api/jobs/:id` | UI; progress, reply, current/last sighting and explicit history status |
| GET | `/api/jobs/:id/audio` | UI; in-memory spoken reply |
| POST | `/api/jobs/:id/correct` | UI; user found/not-found correction |
| GET | `/api/items` | UI; last seen/lost counts, preferring Postgres with legacy S3 fallback |
| GET | `/api/items/:id/sightings` | UI; history with signed photo URLs |
| GET | `/api/status` | UI; camera/worker activity |

The discovery route keeps its historical name but returns the oldest outstanding
job so a busy browser does not skip requests. Cursor is server timestamp plus ID;
client wall time does not advance it. Discovery runs on Ask independently of input
mode. Active replies are not interrupted; playback is once per job per browser
session, with explicit replay and a blocked-autoplay fallback. The last-seen
answer shows the original historical image and box, location and time.

## Failure and operational limits

STT failure produces a no-target request, analysis failure produces a failed job,
and TTS failure still leaves reply text visible. History query failure is distinct
from a successful no-history result. A persistence failure is retryable and cannot
claim memory was saved. Camera failures requeue the same ID. Older late photos
cannot overwrite a newer last-seen location.

This is on-demand capture only: last seen means last photographed. Memory survives
worker/agent restarts; browser-origin in-flight jobs and reply audio do not survive web restart;
Pi-origin requests can be reconstructed from their S3 manifests/results. One Pi/browser is supported; no real-time or multi-camera tracking.
See [DEPLOYMENT.md](DEPLOYMENT.md) for actual-host installation and acceptance.
