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
When a target is absent, the worker SHALL query local Postgres for the newest sighting strictly before capture time and supply at most one relevant record to Hermes over authenticated chat. Hermes SHALL require no database connection or MCP helper. The answer SHALL use stored location/time/photo/box facts, or report never seen only after a successful empty lookup. History SHALL survive restarts.

#### Scenario: History survives restart
- **WHEN** the agent restarts and a fresh photo lacks a wallet seen yesterday
- **THEN** the answer references yesterday's stored sighting and its marked photo

### Requirement: Report unavailable memory honestly
An unavailable Postgres lookup SHALL be reported as history unavailable, not never seen. A result whose observations were not durably saved SHALL NOT claim they were remembered.

#### Scenario: Database offline
- **WHEN** a successful photo analysis finds no keys but Postgres is unreachable
- **THEN** the reply states keys are not visible and history cannot currently be checked

### Requirement: Validate worker-supplied historical evidence
Hermes SHALL use only the bounded historical evidence supplied by the worker. The worker SHALL validate the returned status and detection ID against the canonical item, capture-time cutoff and authoritative newest earlier Postgres sighting. Published historical fields SHALL come from Postgres. Invented, mismatched, contradictory or malformed replies and failed history requests SHALL yield history unavailable.

#### Scenario: Historical sighting supplied through chat
- **WHEN** a wallet is absent now and local Postgres contains an earlier sighting
- **THEN** the worker sends that sighting through the existing chat endpoint and publishes its stored photo/location/time only after validating the returned evidence ID

#### Scenario: Invented evidence ID
- **WHEN** Hermes returns a detection ID different from the supplied authoritative sighting
- **THEN** the worker reports history unavailable without publishing invented historical evidence

#### Scenario: Successful empty local history
- **WHEN** the local query succeeds with no earlier sighting and Hermes acknowledges that supplied outcome
- **THEN** the result reports never seen

#### Scenario: History endpoint fails
- **WHEN** the current image analysis succeeds but the history chat request times out or returns malformed output
- **THEN** history is unavailable and no historical facts are invented

#### Scenario: No direct Hermes database access
- **WHEN** Hermes runs on a different machine with no Postgres connection or MCP helper
- **THEN** history lookup succeeds using local worker queries and the existing HTTPS chat connection
