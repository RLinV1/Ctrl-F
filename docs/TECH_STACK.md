# Tech Stack

Status column: **Decided** = user stated it. **Default** = our recommendation, change if the team disagrees.

| Layer | Choice | Status | Why |
| --- | --- | --- | --- |
| Web app | Next.js (App Router, TypeScript) | Decided | User requirement. API routes receive results from the desktop. |
| Web hosting | Vercel | Decided | User requirement. Serverless: cannot run long jobs or YOLO. |
| Domain | GoDaddy, pointed at Vercel via DNS records | Decided | User requirement. Add domain in Vercel, set A / CNAME at GoDaddy. |
| LLM | Google Gemini | Decided | Parse requests, write replies, optional vision fallback. |
| Voice | ElevenLabs (STT and TTS) | Decided | User requirement. |
| Object detection | YOLO via Ultralytics | Decided | Core of the product. Run on the desktop (GPU if available). |
| Open-vocabulary detection | YOLO-World | Default | COCO lacks keys, wallet, earbuds. YOLO-World takes the class name as text. |
| Database | PostgreSQL (Neon or Supabase) | Decided (Postgres) | Sightings, items, lost counts. Managed instance is reachable from Vercel and the desktop. |
| Object storage | Cloudflare R2 or Supabase Storage (S3 API) | Default | Zero ops. SeaweedFS is possible but needs a VPS. Keep the S3 API so the swap is a config change. |
| ORM / queries | Drizzle (web), SQLAlchemy or psycopg (desktop) | Default | Typed schema in TS; plain SQL is fine in Python. |
| Desktop service | Python 3.11+, FastAPI | Default | Same language as Ultralytics. Exposes endpoints on the LAN. |
| Pi service | Python, picamera2 (or OpenCV), small FastAPI/Flask | Default | `/capture` returns a JPEG. Camera library depends on the camera module used. |
| Pi <-> desktop transport | HTTP on the local network | Default | Simplest. MQTT only if we need push from Pi. |
| Desktop -> web | HTTPS POST to Next.js API route with a shared secret | Default | Vercel cannot call into the desktop. |
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
DESKTOP_TO_WEB_SECRET     # shared secret for desktop -> Vercel API
PI_BASE_URL               # e.g. http://raspberrypi.local:8000
```

Keep a `.env.example` with the names. Real `.env` files are git-ignored.

## Hosting map

- Vercel: Next.js UI and API routes only.
- Managed: Postgres, object storage.
- Local desktop: YOLO inference service.
- Raspberry Pi: camera + mic capture.
