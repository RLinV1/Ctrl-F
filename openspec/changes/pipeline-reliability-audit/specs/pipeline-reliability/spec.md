## ADDED Requirements

### Requirement: Bounded optional remarks
Each retained job SHALL attempt an optional photo remark at most once, including null/error/TTS failure. Polling SHALL NOT repeat paid calls and a late remark SHALL NOT delay or replace the final answer.

#### Scenario: Empty provider reply
- **WHEN** a remark provider returns no text and the same claimed job is polled again
- **THEN** no further remark request is made

#### Scenario: Voice failure
- **WHEN** remark TTS fails
- **THEN** the final answer path remains usable and further polls do not repeat the failed remark

### Requirement: Verified audit boundaries
The audit SHALL record automated validation, actual service/connectivity checks and remaining hardware/environment limitations without treating mocks as live detection acceptance. Production evidence SHALL remain intact.

#### Scenario: Hardware unreachable
- **WHEN** Pi connectivity cannot be established
- **THEN** software checks may continue but physical button/mic/camera acceptance is reported unverified


### Requirement: Invalid discovery cursor recovery
Device discovery SHALL validate stored cursor shape and timestamp before use. Malformed session data SHALL fall back to a fresh valid cursor rather than permanently polling invalid API parameters.

#### Scenario: Corrupt session value
- **WHEN** retained cursor data is an array or contains an invalid timestamp or nonstring ID
- **THEN** discovery resumes with valid fresh parameters and does not replay retained history


### Requirement: Multi-target result identity
Postgres result history SHALL select an observed requested target and display its matching label rather than claiming a missing first target was found. Existing S3 fallback behavior SHALL remain unchanged.

#### Scenario: First target missing
- **WHEN** AirPods and phone are requested but only the phone has a sighting
- **THEN** the stored result identifies phone as found and uses its photo and box
