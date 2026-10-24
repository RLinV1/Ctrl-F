## Context

`web/` does not exist. See `proposal.md` for motivation and the five specs for required behavior.

What exists elsewhere and shapes this design:
- `feat/backend-foundation` (not merged) defines the Postgres schema in `desktop/ctrlf/models.py` and Alembic migration `0001_initial`: `items`, `snapshots`, `detections` (every box, with `bbox` `{x, y, w, h}` and optional `zone`), `sightings` (a detection that is a tracked item), `zones`, `queries`. `docs/ARCHITECTURE.md` still shows an older shape (sightings holding the box), and neither has `jobs`.
- `feat/dev-test` (not merged) has a Vite test UI whose `Overlay` component draws boxes as percentage-positioned divs over an `<img>`. It works and is the pattern to keep.
- The desktop calls ElevenLabs for speech-to-text and text-to-speech and Gemini for the narrator. The web app never calls either.
- Storage is S3-compatible (SeaweedFS locally, R2 later), reached through the S3 API only.
- The TasteSkill skill (`.claude/skills/design-taste-frontend`) is installed for UI work. The team decided steampunk is the brand: its palette and type are fixed, and gears and gauges are allowed only where they carry meaning; TasteSkill's app-screen rules govern everything else.
- The team chose Kokonut UI (a shadcn/ui registry of copy-in React components, built on Tailwind and the `motion` library) for the richer pieces, and anime.js v4 for animations we write.

## Goals / Non-Goals

**Goals:**
- The UI and every route run and pass tests with `DATA_SOURCE=mock`, with no Postgres, storage, Pi, or desktop.
- Switching to `DATA_SOURCE=postgres` needs no UI change.
- The job contract is complete enough that the Pi and desktop teams can build against it from this document alone.

**Non-Goals:**
- Owning migrations. The web app reads the schema; Alembic in `desktop/` creates it.
- Server-sent events or websockets. Polling only.
- An ORM schema that duplicates the Alembic models.

## Decisions

**1. Next.js App Router, route handlers for the API, server components for reads.**
Screens that only read (Items, Item history) render on the server from the data layer, so the first paint has data. The Ask screen is a client component because it owns the microphone and polling. Alternative: a separate API server. Rejected; ARCHITECTURE puts the API in Next.js on Vercel.

**2. One data-layer interface, two implementations.**
`web/lib/data/` exports a `Store` interface (`listItems`, `itemSightings`, `createJob`, `getJob`, `claimNextJob`, `touchDevice`, `deviceStatus`, `audioExists`) with `postgres.ts` and `mock.ts`. `DATA_SOURCE` picks one at startup; routes import only the interface. The mock holds a seeded in-memory dataset (items, snapshots with real fixture photos in `web/public/mock/`, sightings) and advances a created job `pending → claimed → done` on a timer so the Ask flow can be seen without hardware.

**3. Plain SQL with the `postgres` client, not Drizzle.**
TECH_STACK lists Drizzle as a Default. The web app reads tables it does not own, and a Drizzle schema would be a second copy of the Alembic models that can drift. A handful of typed SQL queries in one module is smaller and matches "memory is plain SQL". TECH_STACK is updated to say so.

**4. Schema additions (migration owned by `desktop/`).**

```
jobs
  id               uuid pk default gen_random_uuid()
  status           text not null check (status in ('pending','claimed','done','failed'))
  audio_key        text not null
  query_id         uuid null references queries(id) on delete set null
  snapshot_id      uuid null references snapshots(id) on delete set null
  detection_id     uuid null references detections(id) on delete set null  -- the matched box, when found
  reply_audio_key  text null
  reply_timings    jsonb null      -- [{word, start, end}] seconds into the reply audio
  error            text null
  created_at       timestamptz not null default now()
  claimed_at       timestamptz null
  finished_at      timestamptz null
  index (status, created_at)

device_heartbeats
  device        text pk check (device in ('pi','desktop'))
  last_seen_at  timestamptz not null
```

`snapshot_id` and `detection_id` on the job let the Ask screen draw the matched box without guessing which detection matched. The SQL ships in `web/db/schema-additions.sql` for local use until the Alembic migration lands on the backend branch.

**5. Upload first, then create the job.**
`POST /api/uploads` returns a server-generated key (`audio/<yyyy>/<mm>/<dd>/<uuid>.<ext>`) and a presigned PUT URL (10 min). The browser PUTs the clip, then calls `POST /api/jobs { audioKey }`, which checks the object exists (HEAD) before inserting a `pending` row. Alternative from ARCHITECTURE: one call that returns the upload URL and creates the job. Rejected because the Pi could claim and forward a job whose audio is not there yet. ARCHITECTURE is updated.

**6. Claiming is one SQL statement.**
```sql
update jobs set status = 'claimed', claimed_at = now()
where id = (select id from jobs where status = 'pending'
            order by created_at for update skip locked limit 1)
returning id;
```
`skip locked` makes concurrent polls safe. The same request upserts `device_heartbeats('pi')`. The desktop upserts `device_heartbeats('desktop')` itself every 20 seconds (it writes to Postgres directly), which is documented for the desktop team.

**7. Staleness is computed on read.**
`GET /api/jobs/:id` adds `stale` from `created_at` / `claimed_at` (20 s pending, 60 s claimed) and never writes. The desktop still owns marking jobs `failed`.

**8. Signed URLs with a public endpoint.**
Presigning uses `S3_PUBLIC_ENDPOINT` (falls back to `S3_ENDPOINT`), because in Docker the server reaches SeaweedFS by service name while the browser needs the host address. Snapshot and audio GET URLs expire in 15 minutes; a screen refetches on its next poll or navigation.

**9. Reply audio is a file, played by the browser.**
The desktop sends the narrator text to ElevenLabs TTS, stores the MP3, and sets `jobs.reply_audio_key`. The browser plays it from the signed URL with a plain `<audio>` element: one autoplay attempt after the user's release gesture, then a replay button. The ElevenLabs key never leaves the desktop. For the spoken-word highlight, the desktop uses ElevenLabs' text-to-speech with timestamps, groups the character alignment into words, and stores them in `jobs.reply_timings`; the web app only reads them. If the desktop does not store timings yet, the reply still shows and plays (spec: voice-search). Alternative: stream from ElevenLabs through a Next.js proxy for lower latency. Not now: it puts the key on Vercel and adds a second TTS path.

**10. Recording format.**
`MediaRecorder` with `audio/webm;codecs=opus`, falling back to `audio/mp4` on Safari. ElevenLabs speech-to-text accepts both, so no transcoding. The upload key's extension follows the recorded type.

**11. Session for the password gate.**
`UI_PASSWORD` set → `middleware.ts` requires an HMAC-signed cookie (`ctrlf_session`, HttpOnly, SameSite=Lax, Secure in production, 30 days) whose key is derived from `UI_PASSWORD`, so changing the password signs everyone out. `/api/jobs/next` is excluded from the middleware and checks `Authorization: Bearer ${PI_JOB_TOKEN}` with a constant-time compare.

**12. Boxes as percentage-positioned elements over the image.**
Reuse the `feat/dev-test` overlay approach: the image sits in a `position: relative` frame and each box is an absolutely positioned element at `left/top/width/height` percentages from `{x, y, w, h}`. It scales with the image at every width, needs no canvas, and the box can carry an accessible label. The item name and confidence are also printed beside the photo (spec: voice-search).

**13. Visual direction: steampunk brand inside TasteSkill's app-screen rules.**
Run TasteSkill's app run (`references/app-screens.md`) with `draw.mjs --app --keep palette,type`, screens `home` (Ask), `list` (Items), `detail` (Item history). The brand values below are Tailwind v4 theme tokens (`@theme` in `app/globals.css`), mapped onto shadcn's CSS variables (`--background`, `--foreground`, `--primary`, `--destructive`, `--border`, `--radius`) so shadcn and Kokonut components pick them up without per-component colours. Fixed brand values:
- Palette: aged-paper ground `#F1E8D6`, iron ink `#1F1A14`, brass `#A8772A` for marks and the one primary action, dark brass `#7A5418` where brass must be text, copper `#9C4A2A` for failure. Body text is iron on paper; brass is never used for small text on paper (contrast).
- Type: one Victorian serif family with tabular figures, at most two families including any display cut. The exact face is picked during the run from what the draw offers that fits.

Theme devices allowed only where they carry meaning, each passed to the inspector with `--allow` and named in the report:
- the **lens**: a brass ring that frames the matched item on the snapshot (it is the answer);
- a **gauge** for each device's status (online, or how long since last seen) and for detection confidence;
- a **turning gear** only while a job is in progress (it is the progress state), stopped under `prefers-reduced-motion`.
No decorative gears, rivets, textures, gradients, or shadows elsewhere. Radius is decided once: square corners (`--radius: 0`), matching the printed, engraved feel and TasteSkill's advice against the soft 9–16px default.

**15. Tailwind v4 + shadcn/ui, with Kokonut UI components copied in.**
`shadcn init` sets up Tailwind v4 and `components.json`; `components.json` registers `"@kokonutui": "https://kokonutui.com/r/{name}.json"`, and components are added with `pnpm dlx shadcn@latest add @kokonutui/<name>`. They land in `web/components/kokonutui/` as our source. Each one is restyled before use: brand tokens only, no shadows, glows, gradients, or glass, square corners, sentence-case labels. Used, and what each becomes:

| Kokonut component | Use in Ctrl-F | Adaptation |
| --- | --- | --- |
| `ai-voice` | Ask: talk control and live waveform | Hold-to-talk instead of click-to-start; no playback/discard step, release submits (spec: voice-search) |
| `ai-loading` | Ask: job stages | Stages driven by job status (sent, camera has it, answered); the brass gear sits beside it |
| `receipt-printer` | Ask: the narrator's reply | Prints the reply as a telegram slip; reduced motion shows it whole |
| `synced-transcript` | Ask: word highlight during reply audio | Driven by `reply_timings` and the `<audio>` element's time; plain text when no timings |
| `split-flap-text` | Items and history: "last seen" time | Flips only when the value changes, never on first paint; reduced motion swaps text |
| `contact-sheet` | Item history | Each frame is a sighting; its marker circle is replaced by our box overlay with the brass lens (Decision 12) |
| `uptime-card` | Status area | Shows each device's current state and last activity only; no 90-day bars, since only the latest heartbeat is stored |

Not used: `gradient-button`, `loader`, `liquid-glass-card`, and the hero backgrounds (each breaks a TasteSkill rule), and anything without a job on these screens. Alternative considered: hand-built components on TasteSkill's `app.css`. Rejected by the team in favour of Kokonut's interaction work; the cost is the restyle pass per component.

**16. Animation: `motion` stays inside Kokonut, anime.js v4 for everything we write.**
Kokonut components keep their own `motion` usage as installed (rewriting them would lose their interaction work). Every animation we author — the gear, the gauge needles, the lens drawing around the matched box — uses `animejs` v4 only, created inside an anime.js scope per component and reverted on unmount so React re-renders do not leak animations. Under TasteSkill's app rules, motion is feedback and state only: nothing performs an entrance, and each animation has a reduced-motion path that shows the end state (spec: voice-search). Alternative: use `motion` for our effects too and ship one library. Rejected by the team; anime.js's SVG drawing and timeline APIs suit the gear, needles, and lens. Each screen's one question: Ask, "Where is it right now?"; Items, "What's missing, and where was it last?"; Item history, "Where has this been?"

**14. Tests.**
Playwright runs `next build && next start` with `DATA_SOURCE=mock` and Chromium flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, so push-to-talk records real (synthetic) audio. Failure, offline, autoplay-blocked, and permission-denied states use `page.route` to stub responses or deny permissions. Playwright runs a reduced-motion project (`reducedMotion: 'reduce'`) for the Ask screen. Route handlers get unit tests with Vitest against the mock store; the claim query and staleness logic get a test against a disposable Postgres when `DATABASE_URL` is set (skipped otherwise).

## Risks / Trade-offs

- [The backend branch changes the schema before merge] → All SQL lives in `web/lib/data/postgres.ts`; the mock and API shapes do not depend on table layout.
- [Polling cost and latency] → 750 ms poll on one job only, stopped on done, failed, or stale; status bar every 10 s. Acceptable for one household.
- [Presigned URLs expire while a screen is open] → Screens refetch on poll and navigation; history pages are server-rendered fresh.
- [Autoplay blocked] → Reply text is always shown and the replay control is the fallback (spec: voice-search).
- [Microphone needs a secure context] → Works on `localhost`; testing from another device on the LAN needs HTTPS (`next dev --experimental-https`), noted in `web/README.md`.
- [Theme devices drift into decoration] → Only the three named devices; the TasteSkill inspector runs with `--allow` for those alone and must report 0 FAIL.
- [Kokonut components ship shadows, gradients, rounded corners, or no reduced-motion handling] → A restyle and reduced-motion check per component before it is used, verified by `lint.mjs --app` and `inspect.mjs --app`; the source is ours to change.
- [Two animation libraries in the bundle] → `motion` loads only with the Kokonut components that import it; anime.js is imported per component. Check the Ask screen's client bundle size after task group 8.
- [Kokonut registry changes upstream] → Copied source is pinned in git; we re-add a component only on purpose.
- [Password gate is a single shared secret] → Matches the PRD's single-household scope; real accounts are a non-goal.

## Migration Plan

1. Merge order: `feat/backend-foundation` first (it owns the schema), then its follow-up migration adding `jobs` and `device_heartbeats` from Decision 4, then this branch.
2. Until then, run with `DATA_SOURCE=mock`, or apply `web/db/schema-additions.sql` by hand to a local database migrated by the backend branch.
3. Rollback: the web app adds tables but changes no existing ones; dropping `jobs` and `device_heartbeats` restores the previous schema.

## Open Questions

- Exact typeface within the fixed constraints (Victorian serif, tabular figures, at most two families). Settled during the TasteSkill run without changing specs or tasks.
