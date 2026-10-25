# Hermes search deployment checklist

The coding workstation is not a deployment target. Code and mocked tests can run
here; services, migrations and physical checks belong on the actual hosts.

## 1. Processing host and Postgres

- Install the same repository revision and `desktop/requirements.txt`.
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
- Register the read-only MCP helper as described in `desktop/README.md`, with
  `MEMORY_DATABASE_URL` pointing to the same database using a SELECT-only role.
- Verify `lookup_last_sighting` is available; use a known item UUID and cutoff
  time to verify both a real sighting and a successful empty history.

## 3. Pi and browser

- Follow `pi/README.md`; verify the Logitech ALSA device with a record/playback.
- Configure Pi and web with the same `PI_JOB_TOKEN` and S3 bucket/region.
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
