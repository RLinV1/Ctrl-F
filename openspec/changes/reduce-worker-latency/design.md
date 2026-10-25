## Context
Hermes needs final spoken target phrases to preserve matching for descriptors such as red water bottle. The user explicitly requires no accuracy regression. Postgres is already the sole authority for historical facts.

## Goals / Non-Goals
Remove redundant history round trips and reduce idle pickup delay without changing vision inputs, history cutoff or retry counts. Do not run target-free vision as a shortcut.

## Decisions
Poll once per second after each completed polling pass. This triples idle poll frequency; work still processes serially and the existing per-item failure backoff remains 60 seconds. Theoretical idle sleep saving averages one second and is at most two seconds; API/processing time still contributes.
Read latest strictly earlier sighting once per absent item through repo.lookup_last_sighting. Nonempty rows mean available; successful empty means never_seen; query failure means unavailable. No agent acknowledgement or second recheck is needed without the network gap. Retain legacy recall helper for compatibility, unused by runtime.
Split photo preparation (load JPEG, get metadata/catalog, reconstruct persisted scene) from final processing. For Pi-ready requests, run transcription in a bounded two-thread executor with image retrieval/preparation in the other thread, using independent database sessions. After both succeed, analyze the prepared photo with the final targets and persist results. A failure on either branch must not produce a success or sighting. Persisted transcripts/scenes remain reused on retries. Do not share a SQLAlchemy Session between threads.

## Risks / Trade-offs
Fresh STT and fresh Hermes vision remain sequential because of target dependence; the user chose accuracy preservation. Preparation can overlap, but actual speedup depends on provider/download timings. More frequent polling increases idle S3 traffic. Threads cannot forcibly cancel a running provider call, so existing bounded provider timeouts remain.

## Migration Plan
No schema change. Validate concurrency with synchronization events (not timing thresholds), error/retry behavior and real isolated Postgres memory. Keep feature branch reviewable with checkpoints intact.

## Open Questions
Resolved: user requires preserving accuracy/performance, so target-free parallel vision is excluded.
