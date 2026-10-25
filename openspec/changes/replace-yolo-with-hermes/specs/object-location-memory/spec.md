# Spec Delta

## Purpose

Keeps durable object sightings and their photo evidence so later searches can explain where and when a currently absent object was last observed.

## ADDED Requirements

### Requirement: Persist each successful scene
The system SHALL register new requested/observed categories and persist every accepted object observation and its photo reference in Postgres, including incidental objects. Stored sightings SHALL include capture time, bounding box, and location description. Reprocessing the same photo SHALL NOT duplicate sightings or lost-count changes.

#### Scenario: Retry after processing
- **WHEN** a successfully stored photo is processed again
- **THEN** each original sighting and missing-target count remains recorded only once

### Requirement: Preserve the newest positive sighting
An item's last location SHALL change only upon a newer positive sighting. Absence from a new photo SHALL preserve its previous last-seen location. A successful missing-item request SHALL increment the tracked target's lost count once.

#### Scenario: Older photo processed late
- **WHEN** keys were seen at 10:00 and an 08:00 photo is processed later
- **THEN** the last-seen record remains at 10:00

#### Scenario: Keys disappear
- **WHEN** a new successful analysis does not see keys previously observed on the desk
- **THEN** their previous desk sighting remains available and their lost count increments once

### Requirement: Retrieve historical evidence
When a target is absent, the worker SHALL query local Postgres for the newest sighting strictly before capture time and publish the authoritative stored evidence directly without a recall LLM call. Hermes SHALL require no database connection or MCP helper. The answer SHALL use stored location/time/photo/box facts, or report never seen only after a successful empty lookup. History SHALL survive restarts.

#### Scenario: History survives restart
- **WHEN** the agent restarts and a fresh photo lacks a wallet seen yesterday
- **THEN** the answer references yesterday's stored sighting and its marked photo

### Requirement: Report unavailable memory honestly
An unavailable Postgres lookup SHALL be reported as history unavailable, not never seen. A result whose observations were not durably saved SHALL NOT claim they were remembered.

#### Scenario: Database offline
- **WHEN** a successful photo analysis finds no keys but Postgres is unreachable
- **THEN** the reply states keys are not visible and history cannot currently be checked

### Requirement: Use authoritative historical evidence
The worker SHALL construct historical fields directly from the newest earlier Postgres sighting for the canonical item and capture-time cutoff. It SHALL NOT call a recall LLM to acknowledge those stored facts. Database failures SHALL yield unavailable history; successful empty queries SHALL yield never seen.

#### Scenario: Stored sighting without remote memory call
- **WHEN** a wallet is absent now and local Postgres contains an earlier sighting
- **THEN** the worker publishes that stored photo/location/time directly without a chat acknowledgement

#### Scenario: Successful empty local history
- **WHEN** the local query succeeds with no earlier sighting
- **THEN** history is never seen without making a recall request
