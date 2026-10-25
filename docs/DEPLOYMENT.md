# Hermes search deployment checklist

The coding workstation is not a deployment target. Code and mocked tests can run
here; services, migrations and physical checks belong on the actual hosts.

## 1. Processing host and Postgres

- Install the same repository revision and `desktop/requirements.txt`; configure `ELEVENLABS_API_KEY` on desktop for Pi audio STT.
- Fill root `.env`; back up Postgres; run `alembic upgrade head` from `desktop/`.
- Seed the tracked item catalog with `python -m ctrlf_db.seed ...`.
- Run DB tests against a **separate disposable** `TEST_DATABASE_URL`; record the
  migration test result. The test fixture recreates its database schema.
- Start `python desktop/server.py` from the project root. No YOLO weights needed.

## 2. Hermes host

- Enable the API server, configure a vision-capable provider, and set its shared
  secret. Record the exact Hermes version/commit and vision provider/model here
  before rollout; these are not known from the successful API smoke check.
- Make `/v1/*` reachable over authenticated HTTPS from the processing host.
- Keep database credentials on the processing host. The worker queries local
  Postgres and sends at most one bounded evidence record to Hermes over its chat
  API; no Hermes-host MCP registration or database connection is required.
- Verify available, empty, unavailable and contradictory history outcomes against
  an isolated test database.

## 3. Pi and browser

- Follow `pi/README.md`; verify the Logitech ALSA device with a record/playback.
- Configure Pi in `~/.ctrlf.env` with S3 bucket/region and microphone settings. No web URL/token is needed on Pi.
- Start `pi/capture.py` on the Pi and the web app on its host (`web/README.md`).
- Open one browser on the Ask page and enable audio. All replies play there.

## 4. End-to-end acceptance

1. Put keys and a wallet in view; ask for keys from the browser microphone.
2. Confirm the fresh image marks keys, narration names the location, and both
   keys and wallet sightings were saved in Postgres.
3. Remove the wallet and restart the processing worker and Hermes.
4. Hold the Pi button, ask for the wallet, release. The open browser must show
   progress without switching input modes, then say it is not visible now and
   where/when it was last seen. The old image must show its box.
5. Repeat through the browser mic and typed input. Test explicit replay and a
   browser that blocks autoplay. Check a never-seen item and unavailable history.
6. Send a late older photo and retry the same photo; neither may regress the last
   seen timestamp or duplicate loss counts.
7. Record latency for both triggers and localization on a fixed set of real Pi
   photos. The goal remains p50 under ten seconds; agent/tool latency needs measurement.

## Acceptance record

- Live Hermes connection/image check: passed during development (two observations);
  this checked schema and authentication, not localization ground truth.
- Hermes version/commit and vision model/provider: pending operator recording.
- Real Postgres migration/restart acceptance: pending deployment host.
- Physical Logitech/GPIO and complete voice loop: pending deployment hosts.
- Localization accuracy and end-to-end latency: pending real measurements.

## Recovery and limitations

Keep the additive database columns when rolling back the application. Do not
apply a destructive down migration to remove unscored sightings. An outage never
turns into a missing-item verdict or “never seen.” Current voice jobs/reply audio
remain in web-server memory, so a web restart can lose in-flight jobs; persistent
sightings and historical photos survive. There is one Pi and one active Ask page
in v1. Button requests queue until that page finishes the active reply or the user
moves to the photo; they do not interrupt its audio.


## S3-only Pi upgrade sequence

1. Deploy the updated desktop worker and give it the ElevenLabs STT key. Apply the
   existing migration 0002 if not already deployed; there is no additional migration.
2. Deploy the updated web app with S3 manifest discovery, Gemini and ElevenLabs TTS.
3. Deploy/start Pi with S3 credentials and `PI_AUDIO_DEVICE` in `~/.ctrlf.env`.
   Its persistent local spool retries failed uploads and publishes ready last.
4. If Pi runs before the other upgrades, `.jpeg` device assets are ignored by the
   previous worker; requests remain queued until the consumer is upgraded.
5. Verify a request recorded before a web restart is discovered and narrated after
   restart, along with the normal current/last-seen image checks.

Pi hardware inspection over SSH confirmed Brio 101 capture at 16 kHz mono, Ogg
encoding, a valid webcam JPEG and GPIO 5 access. Complete physical-button voice
acceptance still requires the matching desktop and web revisions running.


### Actual Pi deployment status

The S3-only revision was deployed over SSH to raymond's Pi. `ctrlf-pi.service`
is enabled and active as a systemd user service, with lingering enabled and zero
restarts at verification. It loads `/home/raymond/.ctrlf.env` (backed up privately),
uses the Brio 101 stable ALSA name and GPIO 5, and has a private local retry spool.
All 14 Pi tests passed on the device. No web address or token was configured.
The desktop and web still need the matching S3-only revision before a new button
recording can complete the full spoken-answer loop.

A user-held Grove button test on the actual Pi successfully produced one complete
S3 request: 18,326 bytes of Ogg audio and a 288,137-byte JPEG, followed by its ready
manifest. The local spool cleared after upload. This verifies the physical
button/microphone/camera/S3 path, not the downstream spoken response.


## Preserved processing-server deployment record

The following checkpoints were recovered from the deployed server before its
local code was reconciled with the S3-only revision. Earlier inactive/MCP notes
are historical; the last checkpoint describes the then-active supplied-history path.

## CaptNuu processing-host rollout (2026-10-24 America/New_York)

Revision `932635a16da8bc917831cd0e9dce9e4fc6bd6168` is installed in
`/home/raymond/Ctrl-F`. The separate PostgreSQL 16.15 instance listens on
`127.0.0.1:55432`, with application DB `ctrlf_hermes` and disposable DB
`ctrlf_hermes_test`; the older 5432 database was left untouched. A private
custom-format backup was verified before migration to `0002`; ten tracked names
were seeded. All 92 desktop tests pass against the isolated test DB. Additional
seeded legacy upgrade and fresh-process history-read checks passed.

The `ctrlf-worker.service` user unit is installed, stopped and disabled pending
S3 `PutObject` permission on `ctrlf-snapshots/results/*`. Incoming reads work and
an unsigned request for an existing photo returned 403; bucket-wide privacy
controls require storage-administrator verification. One queued photo was
reported before attempted startup; no application sightings were saved. Hermes
authentication/image schema passed, but remote MCP historical-evidence acceptance
and the deployed Hermes version/provider remain pending. No web or Pi service
was deployed here. Runtime credentials, backups, the proposed minimum worker S3
policy and the full handoff record are in the private, git-ignored
`runs/desktop-deployment-932635a/` folder.

## Worker activation follow-up

S3 result JSON/JPEG write and read checks now pass with the configured credentials.
The user systemd worker is enabled and active; lingering is enabled. The audited
one-photo backlog completed: version-2 JSON and annotated JPEG published, one
photo and one job persisted, zero tracked-object observations. Result history
status is unavailable; remote Hermes MCP memory remains an unresolved dependency.
The result must not be read as a successful never-seen lookup. Restart duplicate
verification recorded separately in runs/desktop-deployment-932635a/restart-check.json.
Hermes version/provider, real historical-evidence acceptance and full web/Pi
voice-loop/hardware checks remain open. No archive performed.

## Supplied-history pivot

The worker now reads local Postgres before sending bounded historical evidence
to Hermes through HTTPS chat. Earlier MCP deployment notes above describe the
superseded implementation; they are not current prerequisites. The active path
needs no helper registration, database exposure or remote SELECT-only role.
Keep existing completed production results intact when deploying this change.
The managed worker must be restarted after the isolated test suite and explicit
remote supplied-evidence acceptance pass. Record results under the processing
host deployment record; hardware/full voice-loop and Hermes release/provider
acceptance remain separate.

## Supplied-history rollout completed

All 109 desktop tests passed with real isolated Postgres (zero skips). Explicit
remote Hermes checks from fresh processes accepted test-only historical evidence
and a successful empty lookup without MCP. The desktop worker was restarted and
is active/running and enabled with zero automatic restarts. The production queue
was empty; one persisted photo, zero detections, one job and completed output
hashes remained unchanged across restart. No existing production result was
reprocessed, so its old history status is retained. New requests use the local
lookup plus HTTPS supplied-evidence path. No Hermes-host database connection,
helper registration or tunnel is required. Version/provider recording and full
web/Pi voice-loop/hardware acceptance remain open.


## S3 voice and deployed-fix reconciliation (2026-10-25 UTC)

The server’s bounded supplied-history fixes are integrated with the S3-only Pi
audio worker. The combined candidate passed 127 desktop tests with zero skips
using the dedicated disposable Postgres database. Application counts remained
unchanged: one photo, zero detections, one job, ten tracked items. Two existing
S3 output references were already missing before this deployment; they were not
deleted by the reconciliation. Original uncommitted source, private env and
service configuration are backed up under
`~/.local/state/ctrlf-reconcile/20261025T041041Z` on the desktop. Preserve the
existing `.venv/worker`, `.env`, Postgres port and flock-protected user service.

The reconciled desktop is deployed from `dev` revision `b0b42c6` (PR #25).
Original edits are retained on server branch `fix/preserved-desktop-20261025`;
the root `.env` was preserved byte-for-byte. `ctrlf-worker.service` is active,
enabled, flock-protected and has zero automatic restarts. Both queued Pi voice
requests completed with transcripts and persisted results. The physical-button
request `970a2e6c-6223-42d4-912c-c69d11f27b71` matched keys and returned
`not_visible` with `history_status=never_seen`; it published an annotated JPEG.
Final application counts are three photos, one detection, three jobs, ten items.
A controlled restart left completed device result hashes and counts unchanged.
Private acceptance evidence is in the backup directory above, including
`candidate-tests.txt` and `restart-verified.json`. The separate web deployment
and spoken browser response have not been verified here.


## Arbitrary-item rollout (2026-10-25)

PR #29 deployed `70c8cb1` to the existing processing worker. Web runs locally on
this computer at port 3000 with the root `.env`; Pi code/protocol is unchanged.
The managed desktop service is active with zero automatic restarts and unchanged
env/venv/service configuration. All 145 isolated-Postgres tests and 66 Playwright
tests passed; TypeScript, targeted lint and 25 web unit tests passed.

A real web request for bottle (`96d33ba7-3c5d-452b-b756-26b46ef4795a`) queued
through S3, triggered a Pi photo, registered the new category, persisted the
completed job and produced Gemini narration plus ElevenLabs audio (HTTP 200,
191,886 bytes). The frame was almost completely black on visual inspection, so
the result was not visible/never seen; this does not verify a positive real-world
bottle detection. Existing 32 completed output hashes were unchanged.

Rollback checkpoint and verified private Postgres/env backup: `docs/ROLLBACK.md`.
The feature is not archived pending review and well-lit hardware acceptance.


## Multi-object case/contents correction

PR #32 deployed `3413e5a` to desktop and restarted local web with root env. The
latest `dev` no-Pi-replay fix (PR #31) was pulled before implementation and remains
included. The actual request `60e611e1-509e-4687-9c70-91ba737b43b7` contained
phone and AirPods case detections, with AirPods unconfirmed. The narrator now
keeps the case/contents distinction and uses explicit factual wording for that
combination. Plain fallback answers every target with independent history.
Hermes instructions also distinguish visible cases from unseen contents.

Verification: 146 isolated-Postgres desktop tests passed (zero skips, application
counts unchanged), 70 Playwright tests, 25 web unit tests, TypeScript, targeted
lint and strict OpenSpec passed. Desktop service is active with zero automatic
restarts and unchanged env; web HTTP 200. Existing checkpoints remain available.


## Conversational target parser correction

PR #35 deployed `415292b` to the desktop worker and local web. Both paths clean
leading greetings, hesitation pauses and standalone determiners without a new
AI call. The deployed Python parser was verified with the live catalog:
“Yo, where my AirPods at?” → airpods; “Where is my, uh, water bottle?” → water
bottle; descriptive bottle/phone requests retain both targets. Existing junk
catalog rows were not deleted or replayed.

Validation: 168 isolated-Postgres tests passed with zero skips and unchanged
application counts; 116 Playwright tests passed across desktop/mobile. TypeScript,
targeted lint and strict OpenSpec passed. Worker active/running, zero automatic
restarts, env unchanged; local web HTTP 200. Private previous HEAD/config:
`~/.local/state/ctrlf-conversational-targets/verification/` on the desktop. Existing
rollback checkpoints remain. The Pi and schema need no changes.


## Worker latency feature preview

Feature branch `feat/raw-photo-target-overlay` (PR #37) now includes source
`de836ee`: one-second post-pass polling, direct authoritative Postgres history
without recall LLM calls, and concurrent Pi transcription/image preparation.
Fresh Hermes vision still waits for final descriptive targets to preserve
matching accuracy. Target-free parallel STT/vision was excluded at the user's
accuracy requirement. Idle S3 polling traffic increases approximately threefold.

173 isolated-Postgres desktop tests, 124 Playwright tests and 27 web unit tests
passed. Concurrency/error/retry/target-input and direct-history checks passed.
The actual desktop runs this feature branch with its existing flock-protected
service active, zero automatic restarts and unchanged env. Previous HEAD/branch,
private env and service configuration are under
`~/.local/state/ctrlf-worker-latency/verification/`; 46 completed output hashes
were preserved. Local web preview runs with root env at port 3000 (HTTP 200).
Dev is deliberately not merged. To roll back this preview, stop the worker,
switch the desktop checkout to its preserved prior dev branch/revision, and
restart the same service; no schema/env migration was introduced.
