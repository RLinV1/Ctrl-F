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
- Register the read-only MCP helper as described in `desktop/README.md`, with
  `MEMORY_DATABASE_URL` pointing to the same database using a SELECT-only role.
- Verify `lookup_last_sighting` is available; use a known item UUID and cutoff
  time to verify both a real sighting and a successful empty history.

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
