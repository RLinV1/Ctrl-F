# Desktop worker

The worker polls private S3 photos, sends them to your existing Hermes API, saves
all tracked-object sightings to Postgres, then writes result JSON and an annotated
JPEG to S3. The Next.js server continues to perform ElevenLabs transcription,
Gemini narration and ElevenLabs speech. Pi-origin audio is transcribed by this worker. The worker needs no YOLO weights or GPU.

Run these steps on the **deployment machines**, not the coding workstation.

## Install and migrate (processing host)

From the repository root, with Python 3.11+:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r desktop/requirements.txt
```

Fill the root `.env` using `.env.example`. Set `DATABASE_URL`, your private S3
credentials, and `ELEVENLABS_API_KEY` for Pi recording transcription. Back up an existing DB, then apply the additive migration and seed
optional initial names/aliases for the catalog used by the web app (new categories are also registered automatically):

```sh
cd desktop
../.venv/bin/alembic upgrade head
../.venv/bin/python -m ctrlf_db.seed phone glasses remote watch headphones keys wallet 'airpods case' airpods charger
cd ..
```

Migration `0002` adds location descriptions and permits unknown confidence. Old
scored rows remain readable. Use a separate disposable `TEST_DATABASE_URL` for
DB tests: fixtures recreate that database's schema. Never use the application DB
as the test database. Application rollback may retain the additive schema.

## Connect the Hermes API

The endpoint is the running **agent API**, not the underlying model-provider URL.
In Hermes's `~/.hermes/.env`, enable `API_SERVER_ENABLED=true` and set
`API_SERVER_KEY` to a strong shared secret. Keep your vision provider/model
configured in Hermes and start `hermes gateway`.

In Ctrl-F's root `.env`:

```dotenv
HERMES_BASE_URL=https://your-hermes-api.example/v1
HERMES_API_KEY=<same value as API_SERVER_KEY>
HERMES_MODEL=hermes-agent
HERMES_TIMEOUT_SECONDS=30
```

The base URL includes `/v1`. For an agent on the **same processing host**, use
`http://127.0.0.1:8642/v1`. Remote agents require HTTPS. Keys are server-side; do
not put them in `NEXT_PUBLIC_` settings. A reverse proxy must forward `/v1/*` to
Hermes's API listener, without a browser-login redirect, and preserve Authorization.
Hermes must listen on an interface reachable by the proxy; its default is loopback.

Official reference: [Hermes API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server).
The adapter uses `/v1/chat/completions` with inline JPEG input, strict result
validation and bounded transport retries. Deployment must record the actual
Hermes version/commit and vision provider/model; this repo does not install or
silently upgrade your existing agent. A real-image smoke check succeeded during
development, but localization accuracy and deployment version remain operator checks.

## Local sighting memory over the chat endpoint

Postgres stays on the processing host. After Hermes analyzes a photo, the worker
queries local Postgres for each absent target's newest sighting strictly before
that photo's capture time. It sends at most one relevant stored record through
the existing authenticated `/v1/chat/completions` endpoint. The payload is capped
at 16 KiB and includes only allowed sighting fields, not database credentials.
Stored descriptions are data, not agent instructions.

Hermes acknowledges the supplied status and detection ID. The worker validates
that response and rechecks the newest earlier record before publishing stored
location/time/photo/box facts. A successful empty query can become `never_seen`;
DB errors, timeouts, contradictory responses or invented IDs become `unavailable`.
Gemini still words the reply and ElevenLabs handles speech in the web service.

The active worker requires no Hermes-host database connection, tunnel, MCP
registration or `MEMORY_DATABASE_URL`. `memory_server.py` remains an optional
legacy utility, outside the active search path. Existing helper roles may remain
unused; do not expose Postgres or share its credentials with Hermes.

## Start and verify

```sh
.venv/bin/python desktop/server.py
```

Separately start the web app and Pi as their READMEs describe. Both triggers use
the existing S3 `jobs/` relay; no inbound access to the processing host or Pi is
required. Worker retries failed processing at most once per photo per minute;
validated scenes already committed to Postgres are reused if S3 publication fails.

An explicit API/image check (does not write S3 or DB and may incur provider usage):

```sh
.venv/bin/python desktop/check_hermes.py --image /path/photo.jpg --width 1280 --height 720
```

Use the actual image dimensions. This check validates the API result, not the
supplied-history evidence path. The full deployment check is in [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).

Mocked tests:

```sh
.venv/bin/python -m pip install -r desktop/requirements-dev.txt
cd desktop
../.venv/bin/python -m pytest
```

No paid API runs in tests. Real Postgres tests skip when the isolated test DB is
unavailable. MCP SDK v1 remains for the optional legacy helper tests; the active worker requires no helper.


## S3-only Pi audio upgrade

Update/restart this worker after the S3-only Pi revision. Pi no longer posts to
web: it uploads `incoming/device/<uuid>.ogg`, `.jpeg` and `.ready.json` last.
The worker consumes only complete validated manifests, checks both objects,
transcribes through ElevenLabs using its own `ELEVENLABS_API_KEY`, matches tracked
Postgres names/aliases, and continues the same Hermes/memory pipeline. Results
carry source, creation time, transcript and targets for independent web discovery.

Grant desktop read access to device audio/metadata/images under `incoming/`.
Pi's `.jpeg` images are deliberately ignored by the previous worker version, so
queued recordings wait safely until this upgrade. STT failures yield an explicit
processing failure and are retried at the existing delay; they do not count as
missing objects. Successfully committed transcripts are reused on later retries.
No new database migration is needed beyond the existing `0002`.


## Existing CaptNuu service deployment

The existing server uses `/home/raymond/Ctrl-F/.venv/worker/bin/python`, not the
root `.venv/bin/python` used in generic examples. Retain that environment, its
user-managed `ctrlf-worker.service`, the flock lock and private `.env`. Update
requirements in that existing environment rather than creating a duplicate worker.
Its dedicated Postgres runs on loopback port 55432; preserve its configured URLs
and the older database on port 5432. Run destructive fixture tests only against
the separate configured `ctrlf_hermes_test` database, never the application DB.


## Open item categories

The catalog supplies names/aliases rather than restricting supported objects.
Ask for a bottle, notebook, or descriptive category such as a blue bottle without
seeding it first. Hermes reports validated requested and incidental objects; the
worker registers new categories and persists their sightings. Common English
find/where requests and direct item phrases are supported. Individual-object
identity and synonym merging are not guaranteed. See `docs/ROLLBACK.md` for the
preserved catalog-only checkpoint.
