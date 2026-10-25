# Spec Delta

## Purpose

Tells the person whether the camera (the Pi) and the desktop that runs the models are working, using only calls those devices make outward, so a failed search can be explained before or while it happens.

## ADDED Requirements

### Requirement: Record Pi activity
Every authenticated call the Pi makes to `GET /api/jobs/next` or `POST /api/device/jobs` SHALL record the current time as the Pi's last activity, whether or not a job is returned.

#### Scenario: Idle poll
- **WHEN** the Pi polls with a valid token and no job is pending
- **THEN** the Pi's last-activity time is updated to now

#### Scenario: Rejected poll
- **WHEN** a call arrives with a wrong token
- **THEN** the Pi's last-activity time does not change

### Requirement: Report device status
`GET /api/status` SHALL return, for the Pi and for the desktop, the last-activity time and `online` true when that time is within the device's window: 15 seconds for the Pi, 60 seconds for the desktop. A device with no recorded activity SHALL be reported offline with a null time.

#### Scenario: Both healthy
- **WHEN** the Pi last polled 3 seconds ago and the desktop last reported 20 seconds ago
- **THEN** both are reported online

#### Scenario: Pi down
- **WHEN** the Pi last polled 2 minutes ago
- **THEN** the Pi is reported offline with its last-activity time

#### Scenario: Never seen
- **WHEN** the desktop has never reported
- **THEN** the desktop is reported offline with a null time

### Requirement: Status indicator on every screen
Every screen SHALL show the Pi's and the desktop's status in words (online, or offline since a time), refreshed at least every 10 seconds. Status SHALL NOT be conveyed by colour alone.

#### Scenario: Camera goes offline
- **WHEN** the Pi stops polling while the user is on the Items screen
- **THEN** within 25 seconds the indicator reads that the camera is offline and since when

### Requirement: Warn before asking when offline
The Ask screen SHALL warn, next to the talk control, when the Pi or the desktop is offline, and SHALL still allow a request to be sent.

#### Scenario: Asking while offline
- **WHEN** the desktop is offline and the user opens the Ask screen
- **THEN** a warning beside the talk control says answers will be delayed until the desktop is back, and the control stays enabled
