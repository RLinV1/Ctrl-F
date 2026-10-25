# Tech Stack

**Current target: run everything locally.** Cloud hosting (Vercel, GoDaddy domain, managed Postgres and storage) is deferred. Every component below is chosen so moving to the cloud later is a config change.

Status column: **Decided** = user stated it. **Default** = our recommendation, change if the team disagrees.

## Local setup

| Layer | Choice | Status | Why |
| --- | --- | --- | --- |
| Web app | Next.js (App Router, TypeScript), `next dev` on the desktop | Decided | User requirement. Bind to `0.0.0.0` so the Pi can reach it. |
| Database | PostgreSQL in Docker | Decided (Postgres) | Same engine as the later managed instance. |
| Object storage | SeaweedFS (S3 API) in Docker | Default | User's first idea. Any S3-compatible store works (MinIO, or R2 later) because code uses the S3 API only. |
| Desktop service | Python 3.11+, FastAPI | Default | Same language as Ultralytics. Runs YOLO on the desktop GPU. |
| Pi service | Python, picamera2 (or OpenCV), small FastAPI | Default | `/capture` returns a JPEG. Polls the web API and forwards photos to the desktop. |
| Pi <-> web | Pi polls `GET http://<desktop-ip>:3000/api/jobs/next` over the LAN | Default | Pi makes outbound calls only. |
| Pi <-> desktop | HTTP on the LAN | Default | Simplest. |
| Audio in/out | Browser microphone (`MediaRecorder`) and browser playback | Decided | The Pi has no microphone. `getUserMedia` works on `http://localhost`. Opening the site from another device needs HTTPS. |
| LLM | Google Gemini | Decided | Narrator only: witty steampunk replies. Does not parse requests or detect items. |
| Voice | ElevenLabs (STT and TTS) | Decided | Cloud API; needs internet and an API key. |
| Object detection | YOLO via Ultralytics, custom fine-tuned | Decided | See `docs/TRAINING.md`. Weights are a local file. |
| Web testing | Playwright (`@playwright/test`) | Decided | All website tests. External APIs are mocked. |
| Python testing | pytest | Default | For `desktop/` and `pi/`. |
| UI auth | Single-user password | Default | Optional while local; required before any deployment. |
| ORM / queries | Plain SQL with `postgres` (web, see the web-ui change), SQLAlchemy 2 + psycopg 3 with Alembic migrations (desktop) | Default | The desktop owns the schema: `desktop/ctrlf_db/models.py` and `desktop/migrations/`. |
| Package managers | pnpm (web), uv or pip + venv (Python) | Default | |
| Orchestration | `docker-compose.yml` for Postgres and SeaweedFS | Default | One command brings up the data services. |

Only the voice, narrator and their APIs need the internet when running locally: ElevenLabs and Gemini.

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
YOLO_WEIGHTS_PATH         # local path to best.pt
WEB_BASE_URL              # Pi polls this, e.g. http://192.168.1.20:3000
PI_JOB_TOKEN              # bearer token the Pi uses on /api/jobs/next
DESKTOP_BASE_URL          # Pi forwards photos here, e.g. http://192.168.1.20:9000
UI_PASSWORD               # single-user login for the web UI
```

## Process map (local)

- Desktop: Next.js dev server, desktop FastAPI service (YOLO), Docker (Postgres, SeaweedFS).
- Raspberry Pi: camera and relay service.
- Browser: microphone and speaker, opened on the desktop at `http://localhost:3000`.

## Docker Compose first

We run the app with Docker Compose before anything else. `docker-compose.yml` at the repo root defines the services.

| Service | Status | Notes |
| --- | --- | --- |
| `postgres` | In the file now | Postgres 16, port 5432 |
| `seaweedfs` | In the file now | S3 API on port 8333, no auth (local only). Unverified: confirm the image command when first started. Create the bucket on first use. |
| `web` | Add when `web/` exists | Next.js, port 3000, published on the LAN so the Pi can poll it |
| `desktop` | Add when `desktop/` exists | FastAPI + YOLO, port 9000. Needs GPU passthrough (NVIDIA Container Toolkit) to use the GPU; without it, runs on CPU. |

The Pi is not part of Compose. Run `docker compose up -d` for the data services, then run web and desktop in Compose or directly on the host while developing.

Inside Compose, containers reach each other by service name (`postgres`, `seaweedfs`). The browser and the Pi use the desktop's host address instead. Signed media URLs must use a host the browser can reach, so keep a separate public S3 endpoint setting if the internal and public addresses differ.

## Going live

See [TECH_STACK_LIVE.md](TECH_STACK_LIVE.md) for the go-live stack (Vercel, GoDaddy domain, managed Postgres, R2) and the checklist.
