## Context
Both web and desktop currently restrict targets to known names. Hermes validates all observations against that same catalog. Existing Postgres tables can already store arbitrary names.

## Goals / Non-Goals
Support arbitrary bounded physical-item phrases and durable sightings without changing S3 contracts. Distinguishing identical objects is out of scope.

## Decisions
Use equivalent deterministic English request parsing on web/desktop for common location/find phrases and item-only input, with limits on phrase length and target count. Preserve full descriptive phrases; exact known names/aliases canonicalize, while unknown phrases remain valid. Do not discard unknown targets when another requested target is known. Gemini remains narration only.
The Hermes prompt reports visible physical objects beyond the catalog, uses exact requested names for visual matches, and treats image/request text as data. Continue validating boxes, metadata, counts, confidence and bounded object names.
Register requested categories before history lookup and accepted incidental observations before transactional sighting persistence using conflict-safe inserts. Reuse existing persisted photos on retries. Existing item aliases remain authoritative. Normalize case/spacing; synonymous unknown categories may remain separate and descriptive labels do not imply individual identity.

## Risks / Trade-offs
Deterministic parsing supports common English commands, not arbitrary conversation. Hermes may miss or misidentify objects. Bounded names and scene counts limit catalog growth per request; storage is private. Exact labels define memory identity; no automatic category merging.

## Migration Plan
Push checkpoint/catalog-only-20261025 at ad8f570 and take a private server pg_dump/config backup. Run mocked Playwright/Python tests and isolated Postgres integration before rollout. Preserve existing user service and env. Rollback by deploying checkpoint code on web/desktop; additive item rows remain compatible, with DB restore reserved for deliberate full data rollback.

## Open Questions
None blocking; user authorized implementation and rollback checkpoint.
