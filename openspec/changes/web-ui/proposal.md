## Why

Ctrl-F has detection work in progress (`feat/dev-test`, `feat/backend-foundation`) but no product UI: the only screen is a developer test page. The PRD makes the browser the voice interface, so nothing is usable end to end until `web/` exists to record a request, hand it to the Pi as a job, and show the answer and each item's history.

## What Changes

- Add `web/`, a Next.js (App Router, TypeScript strict) app.
- Add an **Ask** screen: push-to-talk recording, upload of the clip, job creation, polling for the result, transcript and narrator reply, reply audio playback, and the snapshot with the found item highlighted.
- Add an **Items** screen: every tracked item with last-seen time, last-seen snapshot, and lost count.
- Add an **Item history** screen: one item's sightings over time, each with its snapshot and box.
- Add a **camera status** indicator for the Pi and the desktop on every screen, and a "camera offline" state when a job is not picked up in time.
- Add Next.js API routes: `POST /api/uploads`, `POST /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/next`, `GET /api/items`, `GET /api/items/:id/sightings`, `GET /api/status`.
- Add an optional single-password login, required whenever `UI_PASSWORD` is set.
- Add a data layer that reads the tables defined on `feat/backend-foundation` (`items`, `snapshots`, `detections`, `sightings`, `queries`) and writes only `jobs`, plus a mock implementation so the UI and tests run without Postgres, storage, or the Pi.
- **Schema additions:** a `jobs` table (with the matched snapshot and detection) and a `device_heartbeats` table.
- **Contract change:** audio upload is split from job creation (`POST /api/uploads`, then `POST /api/jobs`) so the Pi can never claim a job whose audio is not stored yet.
- Visual design follows the steampunk brand (fixed palette and type, gears and gauges only where they carry meaning) and the TasteSkill app-screen rules everywhere else.
- Build the UI on Tailwind v4 and shadcn/ui, with selected Kokonut UI components (installed from its shadcn registry and restyled to the brand), and anime.js v4 for every animation we write ourselves.
- The narrator reply highlights each word as the reply audio speaks it, when word timings are available.
- Add Playwright tests in `web/e2e/` against the mock data layer.

Implements PRD F1 (browser side: record and submit) and F9 (items, last-seen snapshot with overlay, history, lost count), plus the web half of the job hand-off. Prepares for F10 (Vercel) without deploying.

## Non-goals

- Desktop job processing (STT, matching, narrator, TTS) and the Pi polling loop. This change provides the endpoints they call and documents the columns they write; it does not implement either side.
- Deployment to Vercel or the custom domain (F10 stays deferred).
- Wake word or hands-free listening; push-to-talk only.
- Live camera video in the browser; screens show stored snapshots only.
- Creating or editing items, aliases, or zones from the UI.
- Multi-user accounts.
- Periodic scanning.

## Capabilities

### New Capabilities
- `job-queue`: Web API for storing a request's audio, creating voice-request jobs, letting the Pi claim the oldest pending job with its token, and reporting a job's status, transcript, reply, and media.
- `voice-search`: The Ask screen flow from push-to-talk to showing the reply, playing its audio, and highlighting the found item, including not-found, offline, and failure states.
- `item-history`: Listing tracked items with last-seen time and lost count, and showing one item's sightings with snapshots and boxes, through API routes and screens.
- `device-status`: Recording when the Pi and desktop were last active and showing each as online or offline.
- `web-access`: The optional single-password gate on the UI and its API routes.

### Modified Capabilities
<!-- None. openspec/specs/ is empty. -->

## Impact

- New directory `web/` with its own `package.json` (pnpm): Next.js, Tailwind CSS v4, shadcn/ui (with the `@kokonutui` registry in `components.json`), `animejs` v4, `postgres` (SQL client), `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, Vitest, Playwright. Kokonut components bring `motion` and `lucide-react` as their own dependencies.
- Kokonut components used: `ai-voice`, `ai-loading`, `split-flap-text`, `receipt-printer`, `synced-transcript`, `contact-sheet`, `uptime-card`. Their source is copied into `web/components/kokonutui/` and owned by us.
- Schema: new `jobs` and `device_heartbeats` tables; `jobs` also carries optional word timings for the reply audio. Alembic in `desktop/migrations` (on `feat/backend-foundation`) owns migrations, so the migration lands there; this branch carries the SQL and the docs.
- New env vars: `DATA_SOURCE` (`postgres` | `mock`), `S3_PUBLIC_ENDPOINT`. Reused: `DATABASE_URL`, `S3_*`, `PI_JOB_TOKEN`, `UI_PASSWORD`.
- `docs/ARCHITECTURE.md` (data model, request flow, web interfaces) and `docs/TECH_STACK.md` (env vars, SQL client instead of Drizzle, Tailwind v4, shadcn/ui, Kokonut UI, anime.js) are updated. The desktop's text-to-speech call is asked to also store word timings (documented, implemented on the desktop side).
- New project dev tool: the TasteSkill skill (`.claude/skills/design-taste-frontend`); its working folder `.taste-skill/` is git-ignored.
