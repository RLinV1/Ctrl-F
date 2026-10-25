# Tasks

## 1. Confirm and fix defects
- [x] 1.1 Reproduce repeated remark attempts, enforce one attempt per retained job, and verify null/error/TTS cases with web tests and updated docs.
- [x] 1.2 Audit discovery no-replay/session-cursor behavior and fix any reproduced reliability defects with Playwright coverage.

- [x] 1.3 Correct Postgres multi-target result selection when only a later target is found; verify real read-only SQL evidence and Playwright reader mapping, preserve fallback configuration.

## 2. Validate and deploy
- [x] 2.1 Run desktop isolated-DB and Pi tests, all web tests, full lint/TypeScript, production build, strict specs and secret/config checks; record evidence.
- [x] 2.2 Check desktop/Pi service, queue, private source/results and DB connectivity; repair authorized config gaps and report unreachable hardware.
- [x] 2.3 Publish reviewed fixes, merge/dev sync and deployment verification; produce a concise audit report with remaining limits.

Audit evidence: 173 desktop tests (isolated Postgres, zero skips, application
counts unchanged); 14 Pi tests; 34 web unit tests; final production browser suite
146 passed, two expected platform skips. The earlier dev-mode suite passed 144
plus two skips, and the later DB result regression passed in the focused suite.
Production build, TypeScript, full ESLint (zero errors; one existing test-image
warning), strict specs and public-asset configured-secret scan passed.

Actual desktop service is active with zero automatic restarts. Private raw-photo
anonymous access returned 403, and cached last-seen DB rows matched newest
sightings. Of 57 historical photo rows, 23 raw and 23 annotated objects exist; 34
of each were already missing. No production evidence/config was modified during
inspection. User explicitly chose to keep S3 fallback and leave DB env unchanged.
Pi SSH timed out twice; live button/mic/camera/service acceptance remains
unverified, not a claimed pass.

Published fixes as PR #42, merged to dev at `9c55433`. Desktop checkout is
synchronized and service remains active with zero restarts; Python source was
unchanged. Local web was restarted with the existing root env. Live S3-backed
items API returned HTTP 200 and signed raw-photo sources. No DB tunnel/config
change, destructive cleanup or new live paid-provider call was made.
