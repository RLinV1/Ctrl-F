## 1. Scaffold

- [ ] 1.1 Create `web/` with Next.js (App Router, TypeScript strict, pnpm), Vitest, and Playwright; verify `pnpm build`, `pnpm exec vitest run` (zero tests), and `pnpm exec playwright test` (zero tests) all succeed
- [ ] 1.2 Add `.taste-skill/` and Playwright output folders to `.gitignore`, add `DATA_SOURCE` and `S3_PUBLIC_ENDPOINT` to `.env.example`, and verify `git status` shows no generated files after a build and a test run

## 2. Data layer

- [ ] 2.1 Define the `Store` interface and shared response types (`Item`, `Sighting`, `Job`, `DeviceStatus`, box as `{x, y, w, h}`) and select the implementation from `DATA_SOURCE`; verify a Vitest test that an unknown `DATA_SOURCE` fails at startup naming the variable
- [ ] 2.2 Implement the mock store with a seeded dataset (at least 4 items, one never seen, fixture photos in `web/public/mock/`) and a job that advances pending → claimed → done on a timer; verify Vitest tests for ordering, never-seen items, and job progression
- [ ] 2.3 Write `web/db/schema-additions.sql` for `jobs` and `device_heartbeats` (design Decision 4); verify it applies cleanly to a database migrated by `feat/backend-foundation`'s `0001_initial`
- [ ] 2.4 Implement the Postgres store with the `postgres` client, including the `skip locked` claim query and heartbeat upsert; verify with tests against a disposable Postgres (skipped when `DATABASE_URL` is unset) covering concurrent claims returning distinct jobs
- [ ] 2.5 Implement storage helpers: presigned PUT for audio, presigned GET for audio and snapshots via `S3_PUBLIC_ENDPOINT`, and HEAD for existence; verify Vitest tests that URLs carry an expiry within the spec limits
- [ ] 2.6 Update `docs/ARCHITECTURE.md` (data model matching the backend schema plus `jobs` and `device_heartbeats`, upload-then-job flow, web API table) and `docs/TECH_STACK.md` (env vars, `postgres` client instead of Drizzle); verify the docs match the types in `web/lib/data/`

## 3. Job queue API

- [ ] 3.1 Implement `POST /api/uploads` and `POST /api/jobs` (reject missing audio with `400`); verify Vitest route tests for success and missing audio
- [ ] 3.2 Implement `GET /api/jobs/next` with bearer-token check, `204` when empty, and the Pi heartbeat; verify route tests for valid token, empty queue, and bad token (no heartbeat recorded)
- [ ] 3.3 Implement `GET /api/jobs/:id` with found and not-found payloads, last sighting, optional reply audio, `stale`, and `404`; verify route tests for each spec scenario in `job-queue`
- [ ] 3.4 Write the desktop and Pi contract notes (columns the desktop writes, desktop heartbeat every 20 s, Pi poll call) in `docs/ARCHITECTURE.md`; verify a teammate can follow them without reading web code

## 4. Access

- [ ] 4.1 Implement the password gate (middleware, sign-in and sign-out, HMAC session cookie) that is a no-op when `UI_PASSWORD` is unset and never applies to `/api/jobs/next`; verify Vitest tests for each `web-access` scenario, and a Playwright test in `web/e2e/access.spec.ts` for sign-in, wrong password, and sign-out

## 5. Visual direction

- [ ] 5.1 Run the TasteSkill app run: inventory the data and jobs, write each screen's one question, run `draw.mjs --app --keep palette,type` for screens home, list, detail, and record the dealt style, the face, and the chosen typeface in `web/DESIGN.md`; verify the file names the style, seed, typeface, and the three allowed theme devices
- [ ] 5.2 Build the app shell (product mark and name, navigation, status area) with the brand tokens from design Decision 13 and the loaded typeface; verify `inspect.mjs --app` at 1440, 768, and 390 reports 0 FAIL and a Playwright test that the shell renders with navigation on all three screens

## 6. Device status

- [ ] 6.1 Implement `GET /api/status` with the Pi (15 s) and desktop (60 s) windows; verify Vitest tests for online, offline, and never-seen devices
- [ ] 6.2 Add the status gauges to the shell, refreshing every 10 s, with status in words; verify a Playwright test in `web/e2e/status.spec.ts` that stubs `/api/status` and sees the camera go offline with its time

## 7. Items and history screens

- [ ] 7.1 Implement `GET /api/items` and `GET /api/items/:id/sightings` with `limit` and `before`; verify Vitest route tests for ordering, paging, limit cap, and `404`
- [ ] 7.2 Build the box overlay component (percentage-positioned, accessible label, brass lens for the matched item); verify a Vitest/DOM test that a box of `{0.48, 0.55, 0.1, 0.12}` renders at those percentages
- [ ] 7.3 Build the Items screen (relative time with exact time on hover and focus, lost count, marked thumbnail, empty state); verify a Playwright test in `web/e2e/items.spec.ts` covering a seen item, a never-seen item, and the empty state
- [ ] 7.4 Build the Item history screen (header with lost count and last seen, newest snapshot largest, load older); verify a Playwright test in `web/e2e/history.spec.ts` that loads older sightings without a page reload
- [ ] 7.5 Run `lint.mjs --app` and `inspect.mjs --app` on both screens with `--allow` for the lens and gauge only; verify 0 FAIL and record the critique round in `web/DESIGN.md`

## 8. Ask screen

- [ ] 8.1 Build push-to-talk (pointer and Space, minimum 0.5 s, webm or mp4 by browser support) with upload and job creation; verify a Playwright test in `web/e2e/ask.spec.ts` using fake media devices for hold-and-release, keyboard, and too-short
- [ ] 8.2 Add microphone permission and unavailable states; verify a Playwright test with microphone permission denied that the control is disabled and the Items screen still works
- [ ] 8.3 Add job polling (750 ms, stop on done, failed, or stale) with the turning-gear progress state and the offline warning beside the control; verify Playwright tests for claimed, camera-offline (stale), failed, and the device-offline warning
- [ ] 8.4 Show the answer: transcript, reply text, one autoplay attempt then replay, found snapshot with the lens, not-found with last sighting or never seen; verify Playwright tests for each `voice-search` answer scenario, including autoplay blocked
- [ ] 8.5 Run `lint.mjs --app` and `inspect.mjs --app` on the Ask screen with `--allow` for the lens, gauge, and gear only; verify 0 FAIL and record the critique round in `web/DESIGN.md`

## 9. Integration

- [ ] 9.1 Write `web/README.md` (install, env vars, mock mode, Postgres mode, HTTPS for LAN microphone access, running tests) and verify a clean clone runs the app in mock mode by following it exactly
- [ ] 9.2 With `DATA_SOURCE=postgres`, the backend branch's database, and SeaweedFS running, simulate the Pi with `curl` on `/api/jobs/next` and the desktop by writing a finished job row; verify the Ask screen shows the reply and the marked snapshot end to end

## Workflow follow-up

- Hand the `jobs` and `device_heartbeats` migration (design Decision 4) to the backend branch owners for Alembic.
- Archive the change after review and merge, and verify the archived specs land in `openspec/specs/`.
