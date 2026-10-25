# Tasks

## 1. Checkpoint
- [x] 1.1 Push the catalog-only Git checkpoint; verify its remote ref.
- [x] 1.2 Preserve desktop code/config and a private verified Postgres dump; document rollback commands.

## 2. Requests and vision
- [x] 2.1 Implement bounded arbitrary target parsing on web/desktop, retain aliases/descriptors/mixed requests; verify shared cases with pytest and Playwright, update request docs.
- [x] 2.2 Open Hermes observations and register dynamic categories while retaining strict evidence validation and retry safety; verify pytest and isolated Postgres history/retry integration, update architecture/PRD.

## 3. Rollout
- [x] 3.1 Run complete relevant Python and Playwright suites, TypeScript and strict OpenSpec validation.
- [x] 3.2 Merge to dev and deploy the existing desktop worker; verify service/config and live bottle processing, start local web with env for user acceptance.

## Workflow follow-up
- Archive after review and full hardware acceptance.

Verification: 145 desktop pytest tests passed against isolated server Postgres,
zero skips and unchanged application counts. Playwright: 66 passed across
desktop/mobile, including bottle UI/voice, S3 queueing, mixed targets and shared
request parsing fixtures. TypeScript, targeted ESLint and strict OpenSpec pass.
Private verified DB backup: `~/.local/state/ctrlf-arbitrary-items/checkpoint-20261025/`.

Live rollout: PR #29 merged at `70c8cb1`; desktop service active/running with
zero automatic restarts, existing env unchanged. Local web runs with root env.
Request `96d33ba7-3c5d-452b-b756-26b46ef4795a` accepted bottle, triggered a fresh
Pi capture, persisted the category/job and returned a not-visible result with
Gemini narration and 191,886-byte ElevenLabs audio (HTTP 200). Visual inspection
showed the actual camera frame was almost black; positive detection awaits a
well-lit scene. All 32 previously completed output hashes stayed unchanged.
Existing web unit suite also passed (25 tests) with the current frozen lockfile.


## 4. Multi-object narration follow-up
- [x] 4.1 Pull latest dev and inspect the actual AirPods/phone result; verify detected case versus absent earbuds before changing matching.
- [x] 4.2 Preserve case/container labels, explain visible case versus unconfirmed contents, and make plain fallback answer every target in request order; verify Playwright regression cases including per-target history.
- [x] 4.3 Clarify Hermes case/contents instructions and docs; verify Python boundary tests, deploy matching desktop/web revision and retain existing checkpoints.

Multi-object regression checks: 146 desktop tests passed with isolated Postgres
(zero skips, application counts unchanged), 70 Playwright tests passed across
desktop/mobile, 25 unit tests passed, TypeScript and targeted lint passed. The
newly pulled no-replay test now waits for the response before checking its
route-captured cursor, eliminating a request/handler timing race.

Multi-object fix deployed from `dev` at `3413e5a` (PR #32). Desktop worker is
active/running with zero automatic restarts and unchanged env. Local web was
restarted with root env and returns HTTP 200. The no-replay update from PR #31
is included. Original completed results were inspected read-only; the observed
AirPods case/phone fixture supplies regression coverage without overwriting the
historical request or manufacturing a new sighting. Rollback checkpoints remain.


## 5. Conversational request parsing
- [x] 5.1 Strip bounded greetings, hesitation punctuation and standalone determiners in both parsers while preserving object descriptions and explicit lists; verify shared real-transcript/regression fixtures with pytest and Playwright.
- [x] 5.2 Verify request queueing, aliases and polluted-catalog behavior without paid calls; update architecture and request docs and run TypeScript/lint/OpenSpec checks.
- [ ] 5.3 Publish and deploy matching web/desktop code, preserve env and checkpoints, and verify the deployed parser and service health.

Conversational parsing checks: 168 desktop tests passed with isolated server
Postgres (zero skips; application counts unchanged), 116 Playwright tests passed
across desktop/mobile, including shared transcript fixtures and real store/S3
queueing for typed/recorded requests. TypeScript, targeted lint, strict OpenSpec
and diff checks passed. Provider calls are mocked in automated tests.
