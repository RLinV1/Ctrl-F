# Spec Delta

## Purpose

The Ask screen: a person holds one control, says what they are looking for, and gets the answer spoken and shown, with the item marked on the photo the camera took.

## ADDED Requirements

### Requirement: Three ways to ask
The Ask screen SHALL be a single chat-style prompt with a menu inside it for choosing how to ask: typing the question (the default), speaking into this computer's microphone, or pressing the camera's button to ask through the camera's mic. The menu SHALL show the chosen way, and the prompt SHALL show only that way's control. There is no model selector.

#### Scenario: Switching
- **WHEN** the user opens the menu and picks "Speak here"
- **THEN** the menu reads "Speak here", the text field and Send are replaced by a hold-to-talk button, and the prompt says to hold the button and ask

### Requirement: Visual-novel stage
The Ask screen SHALL show the narrator on a stage with a dialogue box carrying his name tag. Before a question the box SHALL greet with the last thing seen; while a question is worked on it SHALL say which stage the job is at; once answered, the reply audio SHALL start by itself while the narrator stays on stage, and a "next" arrow (▼) in the dialogue box SHALL fade the narrator out and show the camera's photo with the item circled, and on a second press bring him back.

#### Scenario: Answer on the stage
- **WHEN** a question about the wallet is answered as found
- **THEN** the reply plays with the narrator on stage, pressing ▼ fades him out and shows the photo with the wallet circled, and pressing it again brings him back

### Requirement: Results appear only after asking
The answer and the camera view SHALL NOT be shown until a question has been sent; once one is, the progress, the answer and the camera's photo appear below the prompt.

#### Scenario: Before and after
- **WHEN** the page opens
- **THEN** only the greeting and the prompt are shown, and after a question is sent the progress state and then the answer and the camera view appear

### Requirement: Ask by typing
In typing mode the prompt SHALL send the typed question when Send is pressed or Enter is typed (Shift+Enter starts a new line), keep Send disabled while the field is empty or a question is being worked on, and show the answer exactly as for a spoken question.

#### Scenario: Typed question answered
- **WHEN** the user types "where are my glasses" and presses Enter
- **THEN** the progress state shows, then the answer with "You asked: “where are my glasses”" and the photo with the glasses circled

### Requirement: Ask with the camera button
In camera-button mode the screen SHALL say it is listening for the camera's button, pick up a question asked at the camera within 2 seconds of its job being created, and show its progress and answer as for any question. It SHALL say when the camera is offline.

#### Scenario: Button pressed at the camera
- **WHEN** camera-button mode is open and the camera posts a new recording
- **THEN** the screen moves to the progress state for that question and then shows its answer

#### Scenario: Camera offline
- **WHEN** camera-button mode is open and the camera is offline
- **THEN** the screen says the camera's button cannot be heard

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

### Requirement: Follow the reply as it is spoken
When the reply has word timings, the screen SHALL mark the word being spoken while the reply audio plays, and SHALL leave the whole reply plainly readable when audio is paused, finished, or has no timings.

#### Scenario: Speaking with timings
- **WHEN** the reply audio is 2.1 seconds in and the timings place "desk" from 2.0 to 2.3 seconds
- **THEN** "desk" is marked as the current word

#### Scenario: No timings
- **WHEN** the reply has audio but no timings
- **THEN** the reply text is shown without a moving mark and the audio plays normally

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

### Requirement: Respect reduced motion
When the user prefers reduced motion, the Ask screen SHALL show the same states and content without travel, spin, or flip animations.

#### Scenario: Reduced motion
- **WHEN** reduced motion is preferred and a job is in progress, then finishes
- **THEN** the progress state, reply, and marked snapshot appear without animated movement, and no content is missing

### Requirement: Offline and failure states
The screen SHALL tell the user when the camera has not picked up the request (the job is stale while `pending`) and when processing failed, and SHALL let them try again.

#### Scenario: Camera offline
- **WHEN** the job reports `stale: true` while `pending`
- **THEN** the screen says the camera is offline, stops polling, and offers to try again

#### Scenario: Processing failed
- **WHEN** the job reports `failed`
- **THEN** the screen says in plain words that the request failed and offers to try again
