## 1. Scaffold

- [x] 1.1 Create `web/` with Next.js (App Router, TypeScript strict, pnpm), Vitest, and Playwright; verify `pnpm build`, `pnpm exec vitest run` (zero tests), and `pnpm exec playwright test` (zero tests) all succeed
- [x] 1.2 Run `shadcn init` (Tailwind v4, `components.json`), register `"@kokonutui": "https://kokonutui.com/r/{name}.json"` in `components.json`, and add `animejs` v4; verify `pnpm build` succeeds and `pnpm dlx shadcn@latest view @kokonutui/ai-voice` resolves the registry item
- [x] 1.3 Add `.taste-skill/` and Playwright output folders to `.gitignore`, add `DATA_SOURCE` and `S3_PUBLIC_ENDPOINT` to `.env.example`, and verify `git status` shows no generated files after a build and a test run

## 2. Data layer

- [ ] 2.1 Define the `Store` interface and shared response types (`Item`, `Sighting`, `Job` with optional `replyTimings`, `DeviceStatus`, box as `{x, y, w, h}`) and select the implementation from `DATA_SOURCE`; verify a Vitest test that an unknown `DATA_SOURCE` fails at startup naming the variable
- [ ] 2.2 Implement the mock store with a seeded dataset (at least 4 items, one never seen, fixture photos in `web/public/mock/`, one finished job with word timings and one without) and a job that advances pending → claimed → done on a timer; verify Vitest tests for ordering, never-seen items, and job progression
- [ ] 2.3 Write `web/db/schema-additions.sql` for `jobs` (including `reply_timings`) and `device_heartbeats` (design Decision 4); verify it applies cleanly to a database migrated by `feat/backend-foundation`'s `0001_initial`
- [ ] 2.4 Implement the Postgres store with the `postgres` client, including the `skip locked` claim query and heartbeat upsert; verify with tests against a disposable Postgres (skipped when `DATABASE_URL` is unset) covering concurrent claims returning distinct jobs
- [ ] 2.5 Implement storage helpers: presigned PUT for audio, presigned GET for audio and snapshots via `S3_PUBLIC_ENDPOINT`, and HEAD for existence; verify Vitest tests that URLs carry an expiry within the spec limits
- [ ] 2.6 Update `docs/ARCHITECTURE.md` (data model matching the backend schema plus `jobs` and `device_heartbeats`, upload-then-job flow, web API table) and `docs/TECH_STACK.md` (env vars, `postgres` client instead of Drizzle, Tailwind v4, shadcn/ui, Kokonut UI, anime.js v4, `motion` as a Kokonut dependency); verify the docs match the types in `web/lib/data/` and `web/package.json`

## 3. Job queue API

- [ ] 3.1 Implement `POST /api/uploads` and `POST /api/jobs` (reject missing audio with `400`); verify Vitest route tests for success and missing audio
- [ ] 3.2 Implement `GET /api/jobs/next` with bearer-token check, `204` when empty, and the Pi heartbeat; verify route tests for valid token, empty queue, and bad token (no heartbeat recorded)
- [ ] 3.3 Implement `GET /api/jobs/:id` with found and not-found payloads, last sighting, optional reply audio, optional word timings, `stale`, and `404`; verify route tests for each spec scenario in `job-queue`
- [ ] 3.4 Write the desktop and Pi contract notes in `docs/ARCHITECTURE.md`: columns the desktop writes, word timings from ElevenLabs text-to-speech with timestamps grouped into `{word, start, end}`, desktop heartbeat every 20 s, the Pi poll call; verify a teammate can follow them without reading web code

## 4. Access

- [ ] 4.1 Implement the password gate (middleware, sign-in and sign-out, HMAC session cookie) that is a no-op when `UI_PASSWORD` is unset and never applies to `/api/jobs/next`; verify Vitest tests for each `web-access` scenario, and a Playwright test in `web/e2e/access.spec.ts` for sign-in, wrong password, and sign-out

## 5. Visual direction and foundations

- [ ] 5.1 Run the TasteSkill app run: inventory the data and jobs, write each screen's one question, run `draw.mjs --app --keep palette,type` for screens home, list, detail, and record the dealt style, the face, and the chosen typeface in `web/DESIGN.md`; verify the file names the style, seed, typeface, the three allowed theme devices, and the Kokonut components in use
- [ ] 5.2 Put the brand tokens (design Decision 13) in Tailwind's `@theme` and map them onto shadcn's CSS variables with `--radius: 0`; load the chosen typeface; verify a Vitest/DOM test that a shadcn `Button` renders with the brass primary and square corners
- [ ] 5.3 Add the anime.js foundation: a hook that creates an anime.js scope per component and reverts it on unmount, and a reduced-motion check that skips to end states; verify Vitest tests that unmounting reverts the scope and that reduced motion calls no animation
- [ ] 5.4 Build the app shell (product mark and name, navigation, status area) from shadcn primitives; verify `inspect.mjs --app` at 1440, 768, and 390 reports 0 FAIL and a Playwright test that the shell renders with navigation on all three screens

## 6. Device status

- [ ] 6.1 Implement `GET /api/status` with the Pi (15 s) and desktop (60 s) windows; verify Vitest tests for online, offline, and never-seen devices
- [ ] 6.2 Add Kokonut `uptime-card`, restyle it to the brand, and reduce it to current state and last activity (no day bars); add the gauge with an anime.js needle; refresh every 10 s with status in words; verify a Playwright test in `web/e2e/status.spec.ts` that stubs `/api/status` and sees the camera go offline with its time

## 7. Items and history screens

- [ ] 7.1 Implement `GET /api/items` and `GET /api/items/:id/sightings` with `limit` and `before`; verify Vitest route tests for ordering, paging, limit cap, and `404`
- [ ] 7.2 Build the box overlay component (percentage-positioned, accessible label) with the brass lens drawn by anime.js and shown complete under reduced motion; verify a Vitest/DOM test that a box of `{0.48, 0.55, 0.1, 0.12}` renders at those percentages
- [ ] 7.3 Add Kokonut `split-flap-text`, restyle it, and make it flip only when its value changes and swap text under reduced motion; verify a Vitest/DOM test that the first render does not animate
- [ ] 7.4 Build the Items screen (split-flap "last seen" with exact time on hover and focus, lost count, marked thumbnail, empty state); verify a Playwright test in `web/e2e/items.spec.ts` covering a seen item, a never-seen item, and the empty state
- [ ] 7.5 Add Kokonut `contact-sheet`, restyle it, and replace its marker circles with the box overlay; build the Item history screen on it (header with lost count and last seen, newest sighting largest, load older); verify a Playwright test in `web/e2e/history.spec.ts` that loads older sightings without a page reload
- [ ] 7.6 Run `lint.mjs --app` and `inspect.mjs --app` on both screens with `--allow` for the lens and gauge only; verify 0 FAIL and record the critique round in `web/DESIGN.md`

## 8. Ask screen

- [ ] 8.1 Add Kokonut `ai-voice`, restyle it, and adapt it to hold-to-talk (pointer and Space, minimum 0.5 s, release submits, webm or mp4 by browser support) with upload and job creation; verify a Playwright test in `web/e2e/ask.spec.ts` using fake media devices for hold-and-release, keyboard, and too-short
- [ ] 8.2 Add microphone permission and unavailable states; verify a Playwright test with microphone permission denied that the control is disabled and the Items screen still works
- [ ] 8.3 Add Kokonut `ai-loading`, restyle it, and drive its stages from job polling (750 ms, stop on done, failed, or stale) with the anime.js gear beside it and the offline warning beside the talk control; verify Playwright tests for claimed, camera-offline (stale), failed, and the device-offline warning
- [ ] 8.4 Add Kokonut `receipt-printer` for the reply and `synced-transcript` driven by `replyTimings` and the `<audio>` element's time; show transcript, one autoplay attempt then replay; verify Playwright tests for reply with audio, without audio, autoplay blocked, and the current word marked at a stubbed playback time
- [ ] 8.5 Show the found snapshot with the lens, and not-found with last sighting or never seen; verify Playwright tests for each `voice-search` found and not-found scenario
- [ ] 8.6 Add a Playwright project with `reducedMotion: 'reduce'` and check the Ask flow end to end; verify the progress state, reply, and marked snapshot all appear with no animation running
- [ ] 8.7 Run `lint.mjs --app` and `inspect.mjs --app` on the Ask screen with `--allow` for the lens, gauge, and gear only, and record the Ask screen's client bundle size; verify 0 FAIL and record the critique round and bundle size in `web/DESIGN.md`

## 9. Integration

- [ ] 9.1 Write `web/README.md` (install, env vars, mock mode, Postgres mode, HTTPS for LAN microphone access, adding a Kokonut component, running tests) and verify a clean clone runs the app in mock mode by following it exactly
- [ ] 9.2 With `DATA_SOURCE=postgres`, the backend branch's database, and SeaweedFS running, simulate the Pi with `curl` on `/api/jobs/next` and the desktop by writing a finished job row with timings; verify the Ask screen shows the reply, the moving word mark, and the marked snapshot end to end

## Workflow follow-up

- Hand the `jobs` and `device_heartbeats` migration (design Decision 4) and the word-timings note to the backend branch owners.
- Archive the change after review and merge, and verify the archived specs land in `openspec/specs/`.
