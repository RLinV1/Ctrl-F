# Tech Stack

Status column: **Decided** = user stated it. **Default** = our recommendation, change if the team disagrees.

| Layer | Choice | Status | Why |
| --- | --- | --- | --- |
| Web app | Next.js (App Router, TypeScript) | Decided | User requirement. API routes receive results from the desktop. |
| Web hosting | Vercel | Decided | User requirement. Serverless: cannot run long jobs or YOLO. |
| Domain | GoDaddy, pointed at Vercel via DNS records | Decided | User requirement. Add domain in Vercel, set A / CNAME at GoDaddy. |
| LLM | Google Gemini | Decided | Narrator only: writes the reply in a witty steampunk voice. Does not parse requests or detect items. |
| Voice | ElevenLabs (STT and TTS) | Decided | User requirement. |
| Object detection | YOLO via Ultralytics | Decided | Core of the product. Run on the desktop (GPU if available). |
| Model training | Fine-tune a pretrained Ultralytics YOLO model on our own labeled images | Decided | COCO lacks keys, wallet, earbuds. We train custom classes. See `docs/TRAINING.md`. |
| Labeling | Roboflow, CVAT, or Label Studio | Default | Pick one. Export in YOLO format. |
| Database | PostgreSQL (Neon or Supabase) | Decided (Postgres) | Sightings, items, lost counts. Managed instance is reachable from Vercel and the desktop. |
| Object storage | Cloudflare R2 or Supabase Storage (S3 API) | Default | Zero ops. SeaweedFS is possible but needs a VPS. Keep the S3 API so the swap is a config change. |
| ORM / queries | Drizzle (web), SQLAlchemy or psycopg (desktop) | Default | Typed schema in TS; plain SQL is fine in Python. |
| Desktop service | Python 3.11+, FastAPI | Default | Same language as Ultralytics. Exposes endpoints on the LAN. |
| Pi service | Python, picamera2 (or OpenCV), small FastAPI/Flask | Default | `/capture` returns a JPEG. Camera library depends on the camera module used. |
| Pi <-> desktop transport | HTTP on the local network | Default | Simplest. MQTT only if we need push from Pi. |
| Desktop -> data | Desktop writes directly to Postgres and the S3 bucket; Vercel only reads | Default | Vercel cannot call into the desktop, so no push channel is needed. |
| Audio in/out | Browser microphone (`MediaRecorder`) and browser audio playback | Decided | The Pi has no microphone. The website is the voice interface. |
| Job hand-off | `jobs` table in Postgres; Pi polls `/api/jobs/next` over outbound HTTPS | Default | Vercel cannot reach the Pi. Polling needs no inbound ports. |
| UI auth | Single-user password (Vercel password protection or simple login) | Default | Snapshots are photos of a home. |
| Web testing | Playwright (`@playwright/test`) | Decided | User requirement. All website tests are Playwright E2E. External APIs are mocked. |
| Python testing | pytest | Default | For `desktop/` and `pi/`. |
| Package managers | pnpm (web), uv or pip + venv (Python) | Default | |

## Environment variables (names only, no values in the repo)

```
GEMINI_API_KEY
ELEVENLABS_API_KEY
DATABASE_URL
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
WEB_BASE_URL              # Pi polls this for jobs
PI_JOB_TOKEN              # bearer token the Pi uses on /api/jobs/next
DESKTOP_BASE_URL          # Pi forwards photos here, e.g. http://desktop.local:9000
YOLO_WEIGHTS_PATH         # which trained model version the desktop loads
UI_PASSWORD               # single-user login for the web UI
PI_BASE_URL               # e.g. http://raspberrypi.local:8000
```

Keep a `.env.example` with the names. Real `.env` files are git-ignored.

## Hosting map

- Vercel: Next.js UI and API routes only.
- Managed: Postgres, object storage.
- Local desktop: YOLO inference service.
- Raspberry Pi: camera capture only.
- Browser: microphone and speaker.
