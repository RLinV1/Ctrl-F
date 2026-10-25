# Spec Delta

## Purpose

Produces evidence-backed observations from each search photo so Ctrl-F can locate requested belongings and remember other tracked objects visible in the same scene.

## ADDED Requirements

### Requirement: Analyze all visible physical objects
The system SHALL use Hermes image analysis to examine each fresh search photo for requested and incidental visible physical objects, without restricting names to a configured catalog. The active search pipeline SHALL NOT require YOLO weights.

#### Scenario: Incidental wallet sighting
- **WHEN** the user asks for keys and the photo also shows a tracked wallet
- **THEN** the result includes observations for both visible items

### Requirement: Grounded structured observations
Every accepted observation SHALL identify a bounded normalized object name (resolving existing canonical aliases), a normalized bounding box, and a concise location description grounded in the image. The result SHALL identify its photo, capture time, image dimensions, and analysis model. Invalid observations SHALL NOT update location memory.

#### Scenario: Invalid coordinates
- **WHEN** an analysis response includes a box outside the image or an invalid or overlong object name
- **THEN** validation rejects that response and no observations from it are persisted

### Requirement: Distinguish missing from failed analysis
The system SHALL report a requested item as not visible only after successful image analysis. Timeout, invalid output, unavailable image, or provider failure SHALL produce an explicit analysis failure without a missing-item verdict or lost-count increment.

#### Scenario: Provider timeout
- **WHEN** the image provider times out
- **THEN** the user sees a processing failure rather than being told the keys are absent

### Requirement: Protect photo access
Images supplied to the agent SHALL use private bytes or short-lived signed access. Persisted observations SHALL reference storage keys, never public image URLs or provider credentials.

#### Scenario: Historical image displayed
- **WHEN** a user opens a previously stored sighting
- **THEN** the application generates temporary access to its private photo

### Requirement: Configurable agent endpoint
The Hermes endpoint and authentication SHALL be supplied through server-side environment configuration loaded from the project env file. Missing or invalid configuration SHALL produce a clear setup error. Setup instructions SHALL explain how to start Hermes, configure its vision provider, and obtain the endpoint and matching secret.

#### Scenario: Endpoint changed through env
- **WHEN** an operator changes the configured Hermes base URL and restarts the worker
- **THEN** new analysis requests use that endpoint without a code change

#### Scenario: Endpoint not configured
- **WHEN** the worker starts without the required endpoint
- **THEN** it reports which setting is missing without printing credentials
