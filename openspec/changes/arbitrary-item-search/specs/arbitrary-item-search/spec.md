## ADDED Requirements

### Requirement: Open item requests
Both request paths SHALL retain arbitrary bounded item phrases, normalize known aliases, preserve descriptors, and support mixed known/unknown targets without a fixed allowlist.

#### Scenario: Bottle alongside keys
- **WHEN** a user asks where their bottle and keys are
- **THEN** both targets reach image analysis even when bottle has never been configured

### Requirement: Validated open observations and memory
Hermes SHALL inspect arbitrary visible physical objects. The worker SHALL validate names and geometry and register requested and observed categories for durable sightings, with idempotent retries and existing historical evidence semantics.

#### Scenario: New item then absent
- **WHEN** an unconfigured bottle is observed and a later request cannot see it
- **THEN** its original location/photo/time can be retrieved from Postgres across fresh worker sessions without duplicate sightings on retry

#### Scenario: Invalid observations
- **WHEN** a provider returns invalid metadata, names or boxes
- **THEN** it cannot become a successful detection or persisted sighting

### Requirement: Reversible rollout
The rollout SHALL preserve a pushed code checkpoint and a private deployment backup, document rollback, and retain existing env/service configuration.

#### Scenario: Rollback
- **WHEN** the checkpoint code is redeployed
- **THEN** the original catalog-based behavior runs against the compatible existing schema


### Requirement: Consistent multi-object replies
Replies SHALL describe every requested target in request order, preserve case/container qualifiers, and distinguish a visible case from unconfirmed contents. Missing-item history SHALL remain independent per target, including when narration uses its plain fallback.

#### Scenario: Phone beside AirPods case
- **WHEN** phone and AirPods are requested and only the phone and AirPods case are detected
- **THEN** the reply identifies the visible case, states the earbuds cannot be confirmed, locates the phone and does not claim the case is missing or its contents are visible


### Requirement: Conversational request cleanup
Both request paths SHALL ignore leading conversational greetings, hesitation words and standalone determiners while retaining object descriptions and explicit multi-item requests. Prior junk catalog entries SHALL NOT turn these words into requested objects.

#### Scenario: Greeting and hesitation
- **WHEN** the user says “Yo, where is my, uh, red water bottle and phone?”
- **THEN** targets are red water bottle and phone, with no yo, my or uh target

#### Scenario: Meaningful words remain
- **WHEN** the user asks for a yo-yo, hi hat or plum-colored mug
- **THEN** those object phrases retain their meaningful words
