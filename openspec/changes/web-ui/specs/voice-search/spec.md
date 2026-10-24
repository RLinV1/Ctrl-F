# Spec Delta

## Purpose

The Ask screen: a person holds one control, says what they are looking for, and gets the answer spoken and shown, with the item marked on the photo the camera took.

## ADDED Requirements

### Requirement: Push-to-talk recording
The Ask screen SHALL record from the microphone only while the talk control is held, by pointer or by the Space key while the control has focus. Releasing it SHALL submit the clip. Clips under 0.5 seconds SHALL be discarded with a short hint.

#### Scenario: Hold and release
- **WHEN** the user holds the talk control, speaks, and releases after 2 seconds
- **THEN** the clip is uploaded and a job is created, and the screen shows that the request is being worked on

#### Scenario: Keyboard
- **WHEN** the talk control has focus and the user holds Space, then releases it
- **THEN** recording starts on key down and the clip is submitted on key up

#### Scenario: Too short
- **WHEN** the user releases the control after 0.2 seconds
- **THEN** no job is created and the screen asks them to hold while speaking

### Requirement: Microphone permission states
The Ask screen SHALL explain plainly when the microphone is unavailable or permission is denied, and SHALL keep the rest of the app usable.

#### Scenario: Permission denied
- **WHEN** the browser denies microphone access
- **THEN** the talk control is disabled, the screen says how to allow the microphone, and the Items screen still works

### Requirement: Show progress while the job runs
While a job is not finished, the screen SHALL show its stage (sent, camera has it) from the job status, poll no more often than every 750 milliseconds, and stop polling once the job is done or failed.

#### Scenario: Claimed
- **WHEN** the job moves from `pending` to `claimed`
- **THEN** the screen shows that the camera has the request

### Requirement: Show and speak the answer
When the job is done, the screen SHALL show the transcript and the reply text, play the reply audio once when it exists, and offer a control to replay it. The reply text SHALL be visible whether or not audio plays.

#### Scenario: Reply with audio
- **WHEN** the job is done with reply audio
- **THEN** the transcript and reply are shown and the audio plays once

#### Scenario: Reply without audio
- **WHEN** the job is done without reply audio
- **THEN** the reply text is shown and no replay control appears

#### Scenario: Autoplay blocked
- **WHEN** the browser blocks audio playback
- **THEN** the reply text is shown and the replay control is offered so the user can start the audio

### Requirement: Mark the found item on its snapshot
When the item was found, the screen SHALL show the snapshot with the matched box drawn at its position at every screen width, and name the item and its confidence as text beside the photo, not only inside the image.

#### Scenario: Found
- **WHEN** the job is done with `found: true` and a box of `{x: 0.48, y: 0.55, w: 0.1, h: 0.12}`
- **THEN** a marker frames that region of the displayed snapshot, and the item name and confidence appear as text beside it

### Requirement: Not found shows the last sighting
When the item was not found, the screen SHALL say so and show the item's last sighting with its time and marked snapshot, or say that the item has never been seen.

#### Scenario: Seen before
- **WHEN** the job is done with `found: false` and a last sighting from 3:42 PM
- **THEN** the screen shows "last seen" with that time and the marked snapshot, and links to the item's history

#### Scenario: Never seen
- **WHEN** the job is done with `found: false` and no sighting exists
- **THEN** the screen says the item has not been seen yet

### Requirement: Offline and failure states
The screen SHALL tell the user when the camera has not picked up the request (the job is stale while `pending`) and when processing failed, and SHALL let them try again.

#### Scenario: Camera offline
- **WHEN** the job reports `stale: true` while `pending`
- **THEN** the screen says the camera is offline, stops polling, and offers to try again

#### Scenario: Processing failed
- **WHEN** the job reports `failed`
- **THEN** the screen says in plain words that the request failed and offers to try again
