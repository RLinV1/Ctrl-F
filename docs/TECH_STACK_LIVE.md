# Tech Stack: Live (go-live)

This is the target when Ctrl-F leaves the local machine. The local setup is in [TECH_STACK.md](TECH_STACK.md). Code is written so the move is mostly configuration: same S3 API, same Postgres, same HTTP contracts.

Status: **Decided** = user stated it. **Default** = our recommendation.

| Layer | Live choice | Status | Notes |
| --- | --- | --- | --- |
| Web hosting | Vercel (Next.js) | Decided | Serverless. Cannot run YOLO, cannot call the Pi or desktop. |
| Domain | GoDaddy domain pointed at Vercel | Decided | Add the domain in Vercel, set A and CNAME records at GoDaddy. HTTPS is automatic. |
| Database | Neon or Supabase Postgres | Default | Managed Postgres reachable from Vercel, the Pi, and the desktop. Use a separate read-write role for the desktop. |
| Object storage | Cloudflare R2 (or Supabase Storage) | Default | S3 API only, so code does not change. SeaweedFS on a VPS is the self-hosted alternative. |
| Model service | Desktop at home, running the FastAPI + YOLO service | Default | YOLO needs a GPU; Vercel cannot run it. Keep it on the home desktop for v1. A GPU cloud host is a later option. |
| Pi | Stays at home, camera and relay | Decided | Polls the live web API over outbound HTTPS. Needs no inbound ports. |
| Voice and narrator | ElevenLabs (STT/TTS), Gemini | Decided | Same as local. Keys live in Vercel env vars or the desktop `.env`. |
| UI auth | Required single-user login (or Vercel password protection) | Default | The snapshots are photos of a home. Not optional once public. |
| Media access | Short-lived signed URLs only | Default | Bucket stays private. |
| CI | GitHub Actions: lint, pytest, Playwright | Default | Run Playwright against a mocked backend. |
| Secrets | Vercel env vars for web; `.env` on desktop and Pi | Default | Never committed. |
| Monitoring | Vercel logs plus simple desktop and Pi log files | Default | Add error tracking only if needed. |

## What changes from local

| Setting | Local | Live |
| --- | --- | --- |
| `WEB_BASE_URL` (Pi) | `http://<desktop-ip>:3000` | `https://<your-domain>` |
| `DATABASE_URL` | Docker Postgres | Neon/Supabase connection string |
| `S3_ENDPOINT` | Docker SeaweedFS | R2 endpoint |
| `UI_PASSWORD` | optional | required |
| Web app | `docker compose` container or `next dev` | Vercel deployment |

The Pi and the desktop service keep running at home. Only the web app, the database, and the bucket move.

## Go-live checklist

- [ ] UI login enabled and tested (Playwright)
- [ ] Bucket private; all media served with signed URLs
- [ ] Separate Postgres roles for web and desktop
- [ ] `PI_JOB_TOKEN` rotated from the local value
- [ ] Domain verified in Vercel; HTTPS working
- [ ] ElevenLabs and Gemini keys set in Vercel / desktop `.env`, with spend limits
- [ ] Pi polling the live URL; end-to-end voice query tested from the public site
- [ ] Backups enabled on Postgres
