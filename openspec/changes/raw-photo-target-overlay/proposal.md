## Why
The final photo currently combines an annotated JPEG containing every detection box with a client-side target circle. Users want an uncluttered raw photo with only the requested target highlighted.

## What Changes
- Display private raw camera photos for current and historical evidence across Ask, Results, Items and History (PRD F6/F9).
- Retain the existing client-side target circle and normalized positioning.
- Keep annotated files as worker/debug artifacts; completion protocol is unchanged.
- Work on feature branch `feat/raw-photo-target-overlay`; do not merge dev automatically.

## Capabilities
### New Capabilities
- `raw-photo-display`: signed original photos with target-only overlay.
### Modified Capabilities
None; supersedes annotated-display assumptions in the unarchived Hermes transition.

## Impact
Web S3/Postgres photo selection and Playwright coverage. No Pi/desktop/schema/env changes.

## Non-goals
Changing detection/matching, drawing multiple targets, deleting annotated artifacts, or deployment changes on the desktop.
