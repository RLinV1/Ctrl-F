## ADDED Requirements

### Requirement: Original photo presentation
The web SHALL display a signed private original camera image rather than a JPEG with baked-in detection boxes, for current and historical snapshots from either S3 or Postgres. It SHALL retain the selected target circle and normalized positioning.

#### Scenario: Browser request
- **WHEN** a fresh browser request finds keys alongside incidental objects
- **THEN** the displayed source is its original incoming JPEG and only the selected keys circle is overlaid

#### Scenario: Pi ready request
- **WHEN** a Pi voice request completes
- **THEN** the displayed source is the original incoming/device JPEG, not its annotated result

#### Scenario: Historical lookup
- **WHEN** a requested item is absent and prior evidence is available
- **THEN** the prior original photo is displayed with the prior box used only for its target circle

#### Scenario: Postgres history and result pages
- **WHEN** snapshots are loaded from stored photo rows
- **THEN** readers select the original s3_key and preserve item/photo linkage and geometry
