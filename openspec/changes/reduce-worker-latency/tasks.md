# Tasks

## 1. Polling and memory
- [x] 1.1 Set one-second polling without changing failure backoff; verify worker poll timing test.
- [x] 1.2 Remove active recall calls and use authoritative DB history directly; verify available/empty/failure, aliases, cutoff and retry tests with isolated Postgres, update docs/specs.

## 2. Independent device work
- [x] 2.1 Separate detached photo preparation from final target-guided processing; overlap it with transcription in separate sessions, verify concurrency/error/retry tests and retain target prompts.
- [x] 2.2 Run relevant desktop and web regressions, strict OpenSpec and record limitations; commit/push feature branch for review without merging dev.

- [x] 2.3 Restart the desktop on the tested feature branch with private previous-HEAD/env backups, verify service health and retained checkpoint; leave dev unmerged.

Verification: 173 desktop tests passed against isolated Postgres (zero skips;
application counts unchanged), 124 Playwright tests and 27 web unit tests passed.
Concurrency checks use synchronization events, verify separate sessions and keep
the descriptive target/image input intact. Retry/failure/history cutoff tests pass.
Strict OpenSpec, TypeScript and diff checks passed. Raw-photo display remains
included; latest dev readable-time changes were merged into the feature branch.

Feature deployment: source `de836ee` is running on the actual desktop on branch
`feat/raw-photo-target-overlay`, with active/running user service, zero automatic
restarts and unchanged env. No recent unfinished job was interrupted. Previous
HEAD/branch/private env/service are backed up under
`~/.local/state/ctrlf-worker-latency/verification/`. All 46 prior completed output
hashes remained unchanged. Local feature web restarted with root env and HTTP
200. Dev remains unmerged; PR #37 carries both photo and latency changes.
