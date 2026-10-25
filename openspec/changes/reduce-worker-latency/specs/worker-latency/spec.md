## ADDED Requirements

### Requirement: Faster idle pickup
The worker SHALL use a one-second idle poll delay while retaining existing failed-request backoff and successful-result deduplication.

#### Scenario: Poll interval
- **WHEN** a polling pass completes
- **THEN** the next pass waits one second rather than three

### Requirement: Database-owned historical lookup
The worker SHALL use repo.lookup_last_sighting directly for each absent target without any recall LLM call. It SHALL preserve item/capture-time filtering, missing-history versus unavailable semantics and stored evidence fields.

#### Scenario: Missing object with prior sighting
- **WHEN** Postgres returns its newest earlier sighting
- **THEN** that stored evidence is returned as available without an external memory call

#### Scenario: Query failure
- **WHEN** historical lookup fails
- **THEN** history is unavailable rather than never seen

### Requirement: Accuracy-preserving device concurrency
Device transcription and independent photo preparation SHALL overlap using separate sessions. Fresh vision SHALL retain the final parsed targets. A failed branch SHALL NOT publish success or persist an unvalidated scene.

#### Scenario: Concurrent preparation
- **WHEN** a ready audio/photo request starts
- **THEN** audio transcription may proceed while its image is downloaded, validated and checked for a saved scene, before target-guided vision

#### Scenario: Descriptive target
- **WHEN** the transcript requests a red water bottle
- **THEN** Hermes receives that exact target before image analysis
