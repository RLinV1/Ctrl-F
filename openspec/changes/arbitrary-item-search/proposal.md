## Why
The fixed item catalog silently drops requests for visible objects such as bottles. Users need to ask for arbitrary physical item categories through either trigger, with a rollback checkpoint.

## What Changes
- Accept bounded object phrases outside the catalog on web and Pi voice paths (PRD F2).
- Hermes inspects arbitrary visible objects, respecting requested descriptions and existing aliases (F4–F6).
- Register normalized requested/observed categories in Postgres and retain last-seen evidence (F7–F9).
- Preserve a pushed Git tag and private database/config backup, with documented rollback.

## Capabilities
### New Capabilities
- `arbitrary-item-search`: open category requests, validation, durable sightings and rollback.
### Modified Capabilities
None. This supersedes closed-catalog assumptions in the unarchived Hermes transition.

## Impact
Web target parsing, desktop speech/vision validation and item registration; no Pi protocol or schema migration.

## Non-goals
Individual-object identity, unrestricted chat, guaranteed visual accuracy, training or new services.
