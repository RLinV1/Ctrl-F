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
