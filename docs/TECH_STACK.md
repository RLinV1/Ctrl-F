# Tech Stack

**Current target: deploy on the user's service hosts.** The coding workstation is not a runtime target. Hostnames, credentials, storage and Postgres connections are env-configured; no hosting provider is changed by this transition.

Status column: **Decided** = user stated it. **Default** = our recommendation, change if the team disagrees.

## Local setup

| Layer | Choice | Status | Why |
| --- | --- | --- | --- |
| Web app | Next.js (App Router, TypeScript), `next dev` on the desktop | Decided | User requirement. Bind to `0.0.0.0` so the Pi can reach it. |
| Database | PostgreSQL in Docker | Decided (Postgres) | Same engine as the later managed instance. |
| Object storage | SeaweedFS (S3 API) in Docker | Default | User's first idea. Any S3-compatible store works (MinIO, or R2 later) because code uses the S3 API only. |
| Desktop service | Python 3.11+ polling worker | Default | Python S3 worker calling Hermes HTTP API and persisting Postgres sightings; no GPU required. |
| Pi service | Python, fswebcam, ALSA, ffmpeg, gpiozero | Decided | Logitech USB webcam camera/mic and Grove button; outbound S3 relay. |
| Pi transport | S3 only | Decided | Pi audio/photo ready manifests; no web URL/token. Browser requests retain jobs/ capture relay. |
| Pi <-> processing worker | Private S3 `jobs/`, `incoming/`, `results/` relay | Decided | Retains the actual dev transport; no inbound Pi/worker calls. |
| Audio in/out | Browser microphone or Logitech webcam mic; browser playback | Decided | Hold the Pi button for webcam audio or use browser `MediaRecorder`. `getUserMedia` works on `http://localhost`. Opening the site from another device needs HTTPS. |
| LLM | Google Gemini | Decided | Victorian narration; existing web target-picking fallback remains. Image analysis/memory use Hermes. |
| Voice | ElevenLabs (STT and TTS) | Decided | Cloud API; needs internet and an API key. |
| Object detection | Vision-capable Hermes Agent over authenticated HTTP | Decided | User-approved transition; endpoint from `.env`, strict observations and Postgres history tools. |
| Web testing | Playwright (`@playwright/test`) | Decided | All website tests. External APIs are mocked. |
| Python testing | pytest | Default | For `desktop/` and `pi/`. |
| UI auth | Single-user password | Default | Optional while local; required before any deployment. |
| ORM / queries | Plain SQL with `pg` (web), SQLAlchemy 2 + psycopg 3 with Alembic migrations (desktop) | Default | The desktop owns the schema: `desktop/ctrlf_db/models.py` and `desktop/migrations/`. |
| Package managers | pnpm (web), uv or pip + venv (Python) | Default | |
| Orchestration | `docker-compose.yml` for optional local Postgres | Default | Existing remote service connections remain selected by env. |

ElevenLabs, Gemini and the configured Hermes/provider need reachable endpoints. Local or remote Postgres and S3 are selected through existing env configuration.

## Environment variables (names only, no values in the repo)

See `.env.example`. Real `.env` files are git-ignored.

```
GEMINI_API_KEY
GEMINI_MODEL                # optional, default gemini-flash-lite-latest
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
DATABASE_URL              # e.g. postgresql://ctrlf:ctrlf@127.0.0.1:5432/ctrlf
S3_ENDPOINT               # e.g. http://localhost:8333
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
YOLO_WEIGHTS_PATH         # legacy training tools only
WEB_BASE_URL              # legacy compatibility only, e.g. https://web.example
PI_JOB_TOKEN              # bearer token for /api/device/jobs
DESKTOP_BASE_URL          # legacy only; current capture relay uses S3
UI_PASSWORD               # single-user login for the web UI
```

## Process map (local)

- Service hosts: Next.js web, Python processing worker, Postgres/S3 and Hermes API (possibly on separate hosts).
- Raspberry Pi: camera and relay service.
- Browser: microphone and speaker, opened on the desktop at `http://localhost:3000`.

## Optional local Postgres

`docker-compose.yml` can start Postgres for local experiments on a deployment host.
It does not provision Hermes, the web app or the Pi. Existing external Postgres and
S3 services are configured through `DATABASE_URL` and `S3_*`; this change makes no
new storage-provider choice. The processing worker is a host Python process and
needs no GPU passthrough. The Pi runs separately on its attached hardware.

## Going live

See [TECH_STACK_LIVE.md](TECH_STACK_LIVE.md) for the go-live stack (Vercel, GoDaddy domain, managed Postgres, R2) and the checklist.

## Hermes runtime configuration

The approved transition replaces YOLO inference with an `httpx>=0.28,<1` adapter,
Pillow image annotation and the MCP SDK v1 (`mcp>=1.20,<2`) for the optional legacy
memory helper. The active worker queries Postgres locally and supplies bounded
evidence over the existing Hermes chat API; no remote database access is needed. Ultralytics remains only in optional training tools. Configure
these names in the appropriate host's env file (see `.env.example`):

- `HERMES_BASE_URL`: authenticated agent API base URL including `/v1`; remote HTTPS.
- `HERMES_API_KEY`: matches Hermes's `API_SERVER_KEY`, processing host only.
- `HERMES_MODEL`: API agent identifier, default `hermes-agent`; actual provider/model lives inside Hermes.
- `HERMES_TIMEOUT_SECONDS`: per-call budget, default 30, maximum 120.
- `MEMORY_DATABASE_URL`: optional legacy helper connection; not used by the active worker.
- `PI_AUDIO_DEVICE`: Logitech ALSA device name, configured on the Pi.
- `PI_RECORD_MAX_SECONDS`: bounded recording duration, default 15 (0.5–60).
- `PI_SPOOL_DIR`: optional private local request queue; default `~/.local/state/ctrlf/requests`.
- `CAPTURE_BUTTON_PIN`: Grove GPIO pin, default 5.

Hermes server settings (`API_SERVER_ENABLED`, `API_SERVER_KEY`, `API_SERVER_HOST`,
`API_SERVER_PORT`) belong in Hermes's own configuration. The API defaults to
loopback port 8642; a proxy on another host requires an appropriately reachable
bind address. A real-image smoke check passed; record the deployed agent version
and model/provider on the deployment checklist before production rollout.

See `desktop/README.md`, `pi/README.md`, `web/README.md` and `docs/DEPLOYMENT.md`
for host-specific startup, ALSA/ffmpeg packages, migrations, private S3 permissions
and acceptance tests. The coding workstation is not a deployment target.
