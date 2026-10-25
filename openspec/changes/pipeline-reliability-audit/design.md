## Context
The merged runtime has bounded target parsing, authoritative DB history, concurrent photo preparation and separate optional photo remarks. Audit evidence found remark attempts can repeat after null/error, the local web DB endpoint is unavailable, and current Pi SSH is unreachable.

## Goals / Non-Goals
Reproduce and correct confirmed reliability defects, validate the production path and document limits. Preserve no-replay policy, final-answer priority and signed raw photos.

## Decisions
Track remark attempts per retained job, not only successful audio or in-flight calls; bounded bookkeeping follows job retention. Empty/error/TTS failure must not retrigger on every browser poll.
Validate stored cursor object shape, timestamp and ID before use. Malformed session data must fall back to existing fresh-session behavior. Preserve the current no-replay protocol; browser/Pi clock assumptions and delayed-upload semantics are reported as remaining limitations rather than redesigning discovery in this focused fix.
Automated provider calls stay mocked. Postgres tests use isolated disposable DB. Production inspection is read-only. Any environment connection repair preserves private backups and the selected providers. Pi hardware acceptance depends on restoring connectivity.

A read-only multi-target query also reproduced a missing-first/found-second bug in the Postgres Results reader. Select the first observed requested label and use that label for display; S3 fallback/config stays unchanged.

## Risks / Trade-offs
No sweep can establish universal vision accuracy. Known category/description identity and primary-match display limitations remain. Deleted S3 originals cannot be reconstructed from retained DB rows.

## Migration Plan
Use fix/pipeline-reliability-audit, validate repro/regression coverage and build, publish/merge/deploy authorized fixes with prior configuration preserved.

## Open Questions
User chose to keep S3 fallback and leave DB configuration unchanged. Pi connectivity still needs confirmation; continue independent code/test audit.
