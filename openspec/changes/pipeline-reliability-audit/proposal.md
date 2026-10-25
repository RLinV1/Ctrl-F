## Why
Audit the merged voice/photo/location pipeline and live deployments, reproduce reliability gaps, and fix confirmed defects without expanding product scope (PRD F1–F9).

## What Changes
- Prevent repeated Gemini/TTS remark attempts after empty/failing responses.
- Validate browser device-discovery startup/reload behavior and cursor data.
- Check production build, test suites, data/private-photo consistency, service/config state and deployment connectivity.
- Repair confirmed gaps with targeted regression coverage and document remaining hardware/environment limits.

## Capabilities
### New Capabilities
- `pipeline-reliability`: bounded optional work and verified pipeline operation.
### Modified Capabilities
None; compatible reliability corrections to existing contracts.

## Impact
Primarily web lifecycle/store tests, audit documentation and deployment checks. No destructive cleanup, paid CI calls or object-identity changes.

## Non-goals
New matching features, multiple-object identity, changing storage providers or deleting existing evidence.
