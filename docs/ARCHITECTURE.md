# Architecture

## Active search flow

Ctrl-F has one Pi, one processing worker, one private S3-compatible bucket,
Postgres, a separately configured vision-capable Hermes Agent and one open browser.
The processing worker calls Hermes; the web never calls the Pi or processing host.

```
Browser mic -------------------> web /api/jobs
Pi button -> Logitech mic -----> web /api/device/jobs (Pi bearer token)
                                      |
                                ElevenLabs STT
                                target normalization
                                      |
                                S3 jobs/<id>.json
                                      |
                        Pi polls, claims, takes fresh JPEG
                                      |
                  S3 incoming/<id>.json, then <id>.jpg
                                      |
                         processing worker polls photos
                                      |
                         Hermes image analysis (all tracked objects)
                                      |
        missing target -> Hermes MCP lookup -> Postgres earlier sighting
                                      |
                  worker validates evidence, saves observations to Postgres
                                      |
                   S3 results/<id>_result.json, then _result.jpg
                                      |
                         web polls, Gemini Victorian narrator
                                      |
                            ElevenLabs TTS -> open browser
```

The Pi makes outbound calls only. Web audio comes from the browser; button audio
comes from the Logitech USB webcam. Both reply through the browser. Gemini words
the reply; Hermes analyzes images and uses a restricted Postgres history tool.
The existing web target picker normalizes requests against configured item names;
plain matches are immediate and its pre-existing Gemini fallback remains for
phrasing without a direct match. It does not use Hermes for transcription or TTS.

## Component ownership

- `pi/capture.py`: Grove button, voice recorder, serialized camera, S3 queue relay.
- `pi/voice.py`: hold/release ALSA recording, Ogg encoding, authenticated submission.
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
photos are retained for historical evidence. Raw request audio is transcribed and
discarded by web; reply audio and in-flight web job state are held in web memory.

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

Queue metadata is `{text, targets}`; Pi adds `captured_at` (UTC ISO timestamp)
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
| POST | `/api/device/jobs` | Pi bearer token; raw `audio/ogg`, `audio/webm`, or `audio/mp4`; returns job |
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
worker/agent restarts; in-flight voice jobs and reply audio do not survive web
restart. One Pi/browser is supported; no real-time or multi-camera tracking.
See [DEPLOYMENT.md](DEPLOYMENT.md) for actual-host installation and acceptance.
