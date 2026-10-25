# Proposal

## Why

Ctrl-F must find belongings from a fresh camera photo and remember their previous locations when they leave view. Replace the YOLO class-dependent runtime with Hermes Agent image analysis, while retaining the existing ElevenLabs/Gemini voice experience and Postgres sighting history.

## What Changes

- **BREAKING**: Replace the desktop's YOLO inference path with a Nous Research Hermes Agent adapter backed by a configured vision provider. No YOLO weights or training are required for the active search pipeline (F4, F5).
- Analyze every visible tracked item on every search photo, save validated observations in Postgres, and let Hermes retrieve prior sightings through a narrow application tool (F6, F7, F9).
- Complete the two audio entry paths: browser microphone for web requests; Logitech USB webcam microphone for Pi-button requests. Both lead to a fresh Pi camera capture (F1, F3).
- Keep ElevenLabs STT/TTS and Gemini Victorian narration. Give the narrator grounded current or historical location facts, including time, and show the corresponding marked photo (F8, F9).
- Have the single open browser follow Pi-button requests and play their replies, with an explicit audio-enable/replay fallback.
- Supersede the browser-only microphone and YOLO assumptions in the affected docs and OpenSpec context during implementation. F2 must be revised to describe target normalization independently of a trained YOLO class list; Hermes does not become the speech transcriber or narrator.

## Capabilities

### New Capabilities

No main capabilities exist under `openspec/specs/` yet. These deltas introduce the following contracts; related unarchived changes must be reconciled before archival rather than independently merged as competing specifications.

- `scene-analysis`: Hermes photo analysis, validated object locations, and explicit failure handling.
- `object-location-memory`: Postgres-backed observations, last-seen retrieval, and historical evidence.
- `pi-voice-capture`: Physical-button recording from the Logitech microphone and capture handoff.
- `voice-search`: Both trigger paths, browser playback, and current/last-seen result presentation; reuses the capability path proposed by `web-ui`.

### Modified Capabilities

None in the main spec inventory. This proposal supersedes conflicting proposed behavior in `pi-capture-and-detect`, `add-yolo-training`, `photo-item-tables`, and `web-ui` for the active search flow; existing training utilities and historical data remain available.

## Impact

- Desktop: `server.py`, analysis adapter, Postgres repository and Alembic migrations, runtime dependencies.
- Pi: `capture.py`, microphone/device configuration, bounded recording and physical-button handling.
- Web: existing `/api/device/jobs`, `/api/jobs/latest`, result types, Postgres reader, narrator facts, Ask screen and browser audio handling. Reuse the existing S3 job relay instead of adding inbound Pi/desktop access.
- Private S3 photos remain private; Hermes receives image bytes or a short-lived signed URL. Agent access to Postgres is through restricted tools.
- Docs: PRD, architecture, tech stack, training status, component run instructions, `.env.example`, and `openspec/config.yaml`.

## Non-goals

Multiple Pis/browsers, multi-room tracking, per-owner object identity, continuous/background capture, wake words, Pi speaker playback, replacing ElevenLabs/Gemini, training a new detector, a vector database, and a general-purpose queue rewrite. Hosting migration is outside this change (F10).
