## Why
The worker waits three seconds between polls and calls Hermes to acknowledge history already read from Postgres. Device requests also perform independent image preparation after transcription. Remove avoidable latency while preserving target-guided detection accuracy (PRD F1/F4/F5/F8).

## What Changes
- Poll idle incoming work every second, preserving failure retry backoff.
- Use authoritative Postgres last-sighting results directly, without active recall LLM calls.
- Overlap device transcription with image download/validation and persisted-scene preparation; fresh Hermes analysis still receives final targets.
- Retain saved-scene/transcript retry safety, private storage and failure semantics.

## Capabilities
### New Capabilities
- `worker-latency`: faster polling and independent preparation, database-owned memory.
### Modified Capabilities
None; this supersedes remote history acknowledgement requirements in the unarchived Hermes transition.

## Impact
Desktop worker/processing tests and matching docs/specs. Existing raw-photo feature remains on the current feature branch. No Pi/schema/env change.

## Non-goals
Target-free speculative vision, new identity matching, throughput rewrites or guaranteed latency claims without measurements.
