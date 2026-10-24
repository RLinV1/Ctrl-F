## Purpose

Decides whether a requested item is present in a set of detections, so the system can tell the user where an item is or report that it is not visible.

## ADDED Requirements

### Requirement: Match a requested item to detections
Given a target item name and a list of detections, the matcher SHALL return the detections whose label equals the target or one of the item's aliases, compared case-insensitively. Results SHALL be ordered by confidence, highest first.

#### Scenario: Exact label match
- **WHEN** the target is "keys" and the detections include one labeled "keys"
- **THEN** the matcher returns that detection as the best match

#### Scenario: Alias match
- **WHEN** the target is "keys", the alias list for "keys" includes "car keys", and a detection is labeled "car keys"
- **THEN** the matcher returns that detection

#### Scenario: Multiple matches
- **WHEN** two detections match the target with confidences 0.62 and 0.91
- **THEN** the matcher returns both, with the 0.91 detection first

### Requirement: Report absence explicitly
When no detection matches the target, the matcher SHALL return an empty result and SHALL NOT substitute a different label.

#### Scenario: Item not visible
- **WHEN** the target is "wallet" and no detection is labeled "wallet" or an alias of it
- **THEN** the matcher returns no matches

### Requirement: Reject untrained targets distinctly from absent ones
The matcher SHALL distinguish a target that is not in the model's class list from a target that is in the class list but not visible, so the caller can respond differently.

#### Scenario: Untrained item
- **WHEN** the target is "umbrella" and "umbrella" is not a class the loaded model can detect
- **THEN** the matcher reports the target as unsupported rather than not visible
