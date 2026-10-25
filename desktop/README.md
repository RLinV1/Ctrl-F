# Desktop worker

The worker polls private S3 photos, sends them to your existing Hermes API, saves
all tracked-object sightings to Postgres, then writes result JSON and an annotated
JPEG to S3. The Next.js server continues to perform ElevenLabs transcription,
Gemini narration and ElevenLabs speech. The worker needs no YOLO weights or GPU.

Run these steps on the **deployment machines**, not the coding workstation.

## Install and migrate (processing host)

From the repository root, with Python 3.11+:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r desktop/requirements.txt
```

Fill the root `.env` using `.env.example`. Set `DATABASE_URL` and your private S3
credentials. Back up an existing DB, then apply the additive migration and seed
tracked names from the same catalog used by the web app:

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

## Give Hermes read-only sighting memory

On the **Hermes host**, make this checkout and its Python environment available
(the same revision as the processing host). Install `desktop/requirements.txt`.
Create a SELECT-only Postgres role for `items`, `photos`, `detections`, and `zones`
and put its connection in `MEMORY_DATABASE_URL` in that host's Ctrl-F root `.env`.
It must reach the same Postgres database as the processing worker.

For example, as the DB administrator (replace the database name and password):

```sql
CREATE ROLE ctrlf_memory LOGIN PASSWORD 'replace-with-a-strong-unique-password';
GRANT CONNECT ON DATABASE ctrlf TO ctrlf_memory;
GRANT USAGE ON SCHEMA public TO ctrlf_memory;
GRANT SELECT ON items, photos, detections, zones TO ctrlf_memory;
```

Use that role in `MEMORY_DATABASE_URL=postgresql://ctrlf_memory:<password>@<db-host>:5432/ctrlf`;
URL-encode special characters in the password. Keep this URL only in the helper
host's env file. Apply migrations before granting access to the tables.

Add to Hermes's `~/.hermes/config.yaml`, using real absolute paths on that host:

```yaml
mcp_servers:
  ctrlf-memory:
    command: /absolute/path/Ctrl-F/.venv/bin/python
    args:
      - /absolute/path/Ctrl-F/desktop/memory_server.py
```

Restart Hermes and check that the `lookup_last_sighting` tool is available. This
stdio subprocess only exposes a parameterized lookup by item UUID and cutoff time;
it sets each DB transaction read-only. It stores no images and has no write tool.
The processing worker checks returned evidence IDs against the newest earlier
Postgres record. A failed/unconfigured memory tool produces “history unavailable,”
never a fabricated location or “never seen.”

[MCP configuration reference](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

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
MCP memory setup. The full deployment check is in [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).

Mocked tests:

```sh
.venv/bin/python -m pip install -r desktop/requirements-dev.txt
cd desktop
../.venv/bin/python -m pytest
```

No paid API runs in tests. Real Postgres tests skip when the isolated test DB is
unavailable. MCP SDK major version is constrained below 2 because the server uses
the v1 FastMCP interface.
