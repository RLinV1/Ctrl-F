# Design

## Context

See proposal.md for motivation. Browser-origin requests relay jobs through private S3: web performs ElevenLabs STT, writes `jobs/<id>.json`, Pi polls and writes `incoming/<id>.json` then `.jpg`, desktop writes result JSON then an annotated image, and web performs Gemini narration and ElevenLabs TTS. This differs from the aspirational HTTP/SQL job queue in older docs.

Existing pieces include `/api/device/jobs`, `/api/jobs/latest`, browser discovery gated on camera input mode, stage playback with a blocked-audio fallback, SQLAlchemy photo/detection/item/zone tables, and a Postgres web reader. The Pi button still captures training photos. Historical narration currently consults only recent S3 results and explicitly forbids saying where an item was last seen. The desktop's DB save is optional, and its current poller omits the required capture-time argument when calling process(). No main specs have been archived yet.

## Goals / Non-Goals

**Goals:** Preserve the current relay and frontend experience while replacing the perception boundary, making object history durable, and completing webcam audio input. Keep image analysis independently testable through a restricted adapter.

**Non-Goals:** Queue redesign, a shared conversational-memory service, automatic new object categories, instance/owner tracking, historical backfill, or continuous capture. Use the current configured item vocabulary and aliases; all recognized tracked objects in each search photo are saved.

## Decisions

### 1. Desktop calls a separately running Hermes API

Use a server-side HTTP adapter to Nous Research Hermes Agent. The URL MUST come from the root `.env` through `HERMES_BASE_URL`, with no production endpoint embedded in code. Proposed client settings are `HERMES_API_KEY`, `HERMES_MODEL` (agent-facing identifier), and `HERMES_TIMEOUT_SECONDS`. Validate missing/invalid configuration at startup, redact secrets, and set bounded timeouts/retries. The browser and Pi do not receive the key.

Proposed local example (configuration names become real during implementation):

```
HERMES_BASE_URL=http://127.0.0.1:8642/v1
HERMES_API_KEY=<same secret configured on the Hermes API server>
HERMES_MODEL=hermes-agent
HERMES_TIMEOUT_SECONDS=30
```

The base URL includes `/v1`; the adapter appends `/chat/completions` exactly once. Hermes runs alongside the desktop by default, bound to loopback. A remote deployment changes the URL to a reachable authenticated HTTPS endpoint; it does not require exposing the Pi or desktop. The model and its provider credentials are configured inside Hermes, separately from the agent-facing model identifier used by Ctrl-F.

The setup guide must explain: install/pin Hermes; configure a vision-capable model/provider; enable its API server with `API_SERVER_ENABLED` and `API_SERVER_KEY` in Hermes's own env; start `hermes gateway`; copy the displayed API base URL and matching key into Ctrl-F's root env; start the desktop worker; verify with one test image. An env value supplies an address, not the running agent itself.

Verified interface: Hermes documents its authenticated API and inline image support at https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server . Use an adapter contract test against the pinned release before connecting the worker; do not assume structured-output or grounding accuracy from protocol compatibility. Avoid relying on a Python SDK or shell-spawning an agent on each image.

### 2. Separate observations, memory retrieval, and narration

The desktop sends image bytes (inline) or a short-lived signed URL, capture metadata, the configured item catalog/aliases, and requested targets. Hermes returns structured observations for all tracked objects, even when not requested. The application validates finite positive in-frame boxes, canonical item IDs, bounded description length, photo identity and dimensions. Missing or partial/malformed output is analysis failure, never an empty successful scene.

Normalized contract: observations carry `item`, `bbox: {x,y,w,h}`, and `location_description`; requested-item results distinguish `found`, `not_visible`, and `no_target`. Processing errors are separate. Carry `confidence` only if supplied and validated; make the DB column nullable for models without a meaningful score, and suppress percentages when absent. Do not fabricate YOLO-equivalent confidence.

For absent targets the worker queries local Postgres for the newest strictly
earlier sighting and supplies its allowlisted fields to Hermes over chat. The
payload is limited to 16 KiB, contains no DB credentials and treats stored text as
data. Hermes acknowledges only status and detection ID. The worker validates the
response, rechecks the newest earlier sighting after the network call, and builds
published facts from Postgres. Contradictory IDs, malformed output, timeouts or
query failure yield history unavailable. A successful empty query must remain
separate from an unavailable query. No remote database access, MCP registration
or tunnel is needed; the previous helper remains optional legacy code.

Gemini receives validated current/historical facts and writes the established short Victorian reply; ElevenLabs transcribes and speaks. Keep current target picking initially, using configured items rather than YOLO classes; do not move speech or narration into Hermes. Remove the narrator prohibition on historical location and give it explicit historical location/time facts. Built-in Hermes personal memory is optional and is never authoritative for sightings.

### 3. Extend existing Postgres observations

Add `detections.location_description` and nullable confidence via an additive Alembic migration. Continue storing raw photo keys, optional annotated keys, capture time, dimensions and analysis model/version. Retain geometrically assigned zones from existing polygons; descriptive relations can augment them. Existing rows without descriptions use zone/frame position as fallback.

Save validated observations transactionally through the repository. Preserve unique photo keys, monotonic `items.last_*`, aliases, highest-confidence selection when scores exist, deterministic selection otherwise, and idempotent lost counts. Memory is scoped to canonical item category in v1; two wallets are not uniquely identified.

Require `DATABASE_URL` for the new memory-enabled worker. A database outage must not silently produce a durable-success marker. Retry boundedly and expose a clear persistence/history error; a current observation can be described only with an explicit history-unavailable warning, never a claim that it was remembered. Query failures differ from a successful empty history result. Retain photos for retries. Do not overwrite prior sightings on absence or analysis failure.

Use Pi capture timestamps going forward; label legacy fallback times as S3 upload times. Historical lookup excludes the current photo and uses earlier capture timestamps. Restart tests must prove the answer comes from Postgres, not the last 60 S3 JSON files or Hermes conversation history.

### 4. Preserve the S3 job relay and adapt results

Keep current job IDs, S3 keys and JSON-before-image completion order. Deserialize legacy results for existing history. The desktop draws annotated photos from accepted boxes without YOLO; web receives current match or historical photo/box plus explicit `history_status` (`available`, `never_seen`, `unavailable`). A historical box is always attached to its historical image, never drawn on the fresh photo.

Use a versioned result contract carrying per-target results, descriptions, capture time, and persistence status. Error result JSON must let web stop polling without requiring a success image. Failed or unpersisted processing stays retryable; completion checks must not skip it forever merely because an output file exists. Fix the desktop poller's capture-time call as part of this boundary.

### 5. S3-only Pi audio and capture

Hold the Grove button to record Logitech audio; release captures a fresh photo.
Pi keeps audio/photo metadata in a private persistent local spool until uploads
succeed. It uploads `incoming/device/<uuid>.ogg`, `.jpeg`, then `.ready.json` last.
The manifest records version, source, UUID, UTC creation/capture times, and the two
exact object keys. `.jpeg` intentionally avoids the older worker's `.jpg` scan,
so new uploads wait safely until the desktop update is deployed. No web URL or
Pi bearer token is needed on the Pi. Legacy browser S3 jobs/ capture stays supported.

Desktop consumes validated ready manifests, verifies both objects, transcribes
Ogg audio with ElevenLabs, matches canonical items/aliases from Postgres, then runs
the existing Hermes/persistence path. It publishes source, transcript, targets and
creation time with its results so web can reconstruct device jobs after restart.
A persisted job transcript is reused on a publication retry. Partial uploads are
ignored; failed STT never creates missing-item counts. Worker needs an ElevenLabs
STT credential in addition to its existing Hermes/database/S3 settings.

Raw audio remains private in S3 and the local spool is removed only after the ready
manifest succeeds. Document operator-controlled S3 retention; do not create an
automatic expiry policy or delete bucket objects without an explicit request.

### 6. Browser follows device requests and owns playback

Device discovery runs in the shared Ask lifecycle. Web scans valid S3 ready manifests and reconstructs jobs/results independently of web memory. A fresh browser cursor begins at the start of stored device history; the existing session cursor avoids repeat presentation during that session. Poll while visible regardless of selected mode; use stable job IDs and a monotonic cursor, avoid advancing the cursor to client wall time, and deduplicate in the browser session. Serialize active replies and surface an incoming request without silently replacing an active web search. With one Pi/browser, serialize Pi requests and retain unpresented device IDs until handled; no multi-client dispatch is introduced.

Retain stage and camera UI, add one-time audio enablement plus explicit replay when needed, and keep text usable without sound. Historical results show location/time and marked historical evidence with a history link. Preserve typed input, reduced motion, keyboard controls and existing private photo access.

## Risks / Trade-offs

- Small objects and vision-generated boxes may be inaccurate -> evaluate a fixed set of real Pi photos, reject invalid outputs, preserve user correction; do not promise localization accuracy from agent choice alone.
- Agent calls may miss the existing ten-second goal -> measure end-to-end latency; bound turns, timeouts, tools and retries. Provider/model selection is configuration, with measured acceptance before rollout.
- An endpoint alone does not provision a model -> the setup guide separates the Hermes process, its provider credentials, and Ctrl-F client env; run a capability check before starting searches.
- Webcam capture support is hardware-dependent -> actual Logitech/ALSA manual check is required; mock GPIO/audio in CI.
- Existing docs and unarchived changes conflict -> reconcile superseded sections and capabilities before archive; do not archive competing versions independently.
- S3 relay and browser job state retain current restart limitations -> durable sightings are guaranteed; fully durable in-flight voice jobs are outside this change and must be documented.
- Sending private images to a remote provider -> document chosen provider and use scoped, temporary image access; keep keys server-side.

## Migration Plan

1. Ship additive DB changes and compatible readers; keep existing history readable.
2. Configure and verify Hermes locally, including supplied-history acknowledgement and image input; record the exact tested version/provider/model.
3. Replace the desktop runtime inference and result contract, retain private S3 relay, and test DB persistence/retry before marking jobs complete.
4. Enable Pi mic and browser discovery/playback, then perform hardware acceptance checks.
5. Update docs, env names and OpenSpec context; reconcile overlapping changes before archival.
6. Roll back by stopping the new worker and restoring the prior application version; retain additive columns and historical rows. Do not erase sightings or run destructive schema rollback as part of application rollback.

## Open Questions

Deferrable deployment inputs: exact Logitech ALSA identifier and chosen vision provider/model. Both are configuration values; the image/tool contract and hardware acceptance checks remain mandatory regardless of selection.


## Implementation reconciliation

The user clarified that this workstation is not a deployment host. Run mocked
verification here; real Postgres, Hermes release recording and physical Pi checks
remain acceptance tasks on the actual hosts, and do not block independent code work.

The worker now uses the version-2 S3 result contract documented in ARCHITECTURE.md.
The active worker queries local Postgres and supplies bounded historical evidence
over the same env-configured Hermes API. The old MCP helper is optional legacy
code and is not a deployment dependency. A committed scene is reused after
publication failure and failed photos have a one-minute retry delay. The active
queue transport remains S3; the web target picker retains the existing fallback.

Before archival, consolidate the following earlier proposed contracts using the
new capability specs rather than independently archiving superseded definitions:

| Earlier proposal | Superseded portion | Current contract |
| --- | --- | --- |
| pi-capture-and-detect | YOLO/local weights, HTTP detector and old target matching | scene-analysis; S3 worker contract |
| add-yolo-training | Trained weights as a prerequisite to search | Optional historical training; scene-analysis |
| photo-item-tables | Required numeric scores, DB-optional memory success | object-location-memory; migration 0002 |
| web-ui | Browser-only input assumptions, input-mode-gated device discovery and current-photo-first last-seen view | voice-search |

Their proposal headers now identify the supersession; unrelated existing behavior
is preserved. Main specs remain untouched until a reviewed archival/consolidation.

The S3-only Pi transport supersedes the earlier device-audio HTTP submission assumption throughout this change. Existing `/api/device/jobs` can remain for compatibility, but the deployed Pi never calls it.


## Deployed-server reconciliation

The desktop deployment agent changed history transport at commit 932635a without
committing its working tree. Those source/test changes were backed up and ported
into the current S3-only branch. Preserve the worker-supplied evidence contract
above, the dedicated local Postgres instance, existing user service/flock, private
configuration, completed result objects and S3 transcript/ready-marker behavior.
Validate the combined code against the server's disposable test DB before
updating/restarting the single managed worker. No new DB migration is introduced.
