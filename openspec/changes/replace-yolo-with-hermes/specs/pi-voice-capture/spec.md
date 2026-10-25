# Spec Delta

## Purpose

Lets a person request an object at the Raspberry Pi using its physical button and Logitech webcam microphone, with answers delivered through the open web browser.

## ADDED Requirements

### Requirement: Record from the webcam microphone
Holding the Pi button SHALL record from the configured Logitech USB microphone; releasing it SHALL submit the recording. Recording SHALL stop after a configured maximum duration. Clips shorter than 0.5 seconds SHALL NOT create search jobs.

#### Scenario: Hold and release
- **WHEN** the user holds the Pi button for three seconds while asking for keys and releases it
- **THEN** one recording from the webcam microphone is submitted as a device request

### Requirement: Submit complete S3 device requests
On release, Pi SHALL capture a fresh photo and upload private audio and photo objects under one UUID. It SHALL publish a ready manifest only after both uploads succeed. The Pi SHALL require no web address or web token. Failed uploads SHALL remain locally queued for retry under the same ID.

#### Scenario: Ready after both uploads
- **WHEN** the audio and image uploads succeed
- **THEN** the ready manifest is written last and the desktop can process the request

#### Scenario: Interrupted upload
- **WHEN** either data upload fails
- **THEN** no ready manifest is published and the Pi retains the request for retry

### Requirement: Recover from device failures
Missing microphone, recording failure, or failed upload SHALL produce a diagnostic without creating a successful search. Repeated button edges SHALL NOT start overlapping recordings, and camera access SHALL remain serialized with web-triggered captures.

#### Scenario: Microphone unavailable
- **WHEN** the configured microphone cannot be opened
- **THEN** the Pi reports the device failure and remains available for later requests

#### Scenario: Duplicate button edges
- **WHEN** the button bounces during an active recording
- **THEN** no additional recording or request is created
