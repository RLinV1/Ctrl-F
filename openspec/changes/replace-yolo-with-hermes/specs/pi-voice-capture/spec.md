# Spec Delta

## Purpose

Lets a person request an object at the Raspberry Pi using its physical button and Logitech webcam microphone, with answers delivered through the open web browser.

## ADDED Requirements

### Requirement: Record from the webcam microphone
Holding the Pi button SHALL record from the configured Logitech USB microphone; releasing it SHALL submit the recording. Recording SHALL stop after a configured maximum duration. Clips shorter than 0.5 seconds SHALL NOT create search jobs.

#### Scenario: Hold and release
- **WHEN** the user holds the Pi button for three seconds while asking for keys and releases it
- **THEN** one recording from the webcam microphone is submitted as a device request

### Requirement: Submit authenticated device requests
The Pi SHALL submit audio using its bearer-authenticated device endpoint. Each accepted request SHALL use the same transcription and search pipeline as browser audio and cause a fresh camera capture. The Pi SHALL use outbound connections only.

#### Scenario: Device request accepted
- **WHEN** a valid Pi recording is accepted
- **THEN** it is transcribed by ElevenLabs and a fresh photo is captured for the resulting search job

### Requirement: Recover from device failures
Missing microphone, recording failure, or rejected submission SHALL produce a diagnostic without creating a successful search. Repeated button edges SHALL NOT start overlapping recordings, and camera access SHALL remain serialized with web-triggered captures.

#### Scenario: Microphone unavailable
- **WHEN** the configured microphone cannot be opened
- **THEN** the Pi reports the device failure and remains available for later requests

#### Scenario: Duplicate button edges
- **WHEN** the button bounces during an active recording
- **THEN** no additional recording or request is created
