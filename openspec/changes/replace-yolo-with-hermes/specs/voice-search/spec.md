# Spec Delta

## Purpose

Connects browser and Pi spoken requests to the same search experience, with Victorian spoken replies and correctly marked current or historical photo evidence.

## ADDED Requirements

### Requirement: Shared spoken request pipeline
Browser requests SHALL record from the browser microphone and Pi-button requests from the webcam microphone. Browser audio SHALL be transcribed on web and Pi audio on desktop, both using ElevenLabs. Both SHALL use Hermes image analysis and memory lookup, Gemini Victorian narration, and ElevenLabs speech output. Existing typed requests SHALL remain usable.

#### Scenario: Browser voice request
- **WHEN** the user records "Where are my keys?" in the web app
- **THEN** the Pi captures a fresh photo and the browser receives a narrated search result

### Requirement: Follow Pi requests in the open browser
The single open browser SHALL discover new Pi-originated requests within two seconds of job creation while active, regardless of selected input mode. It SHALL show their progress and results without resubmitting them. Each job SHALL be presented and automatically played at most once per browser session.

#### Scenario: Device request while typing mode is selected
- **WHEN** the Pi creates a request while the open browser has typing selected
- **THEN** that browser follows the Pi request and shows its answer

### Requirement: Browser owns reply playback
Both trigger paths SHALL play replies through the browser, not a Pi speaker. The browser SHALL offer audio enablement and replay controls, retain readable text when playback fails, and avoid overlapping replies.

#### Scenario: Autoplay blocked
- **WHEN** a device-triggered answer arrives and automatic playback is blocked
- **THEN** the answer remains visible and a user-activated play control is available

### Requirement: Show evidence for current and historical locations
A visible target SHALL show its current marked photo and location. An absent target with history SHALL show its last-seen marked photo, location, and timestamp, explicitly labeled historical. A target with no prior sighting SHALL be described as never seen only after a successful history lookup.

#### Scenario: Historical keys photo
- **WHEN** keys are absent now but were seen on the desk at 14:35
- **THEN** the browser shows the desk photo with the keys marked and labels it last seen at 14:35

### Requirement: Narrate only supplied facts
Gemini SHALL word current and historical locations using validated facts, preserving the distinction between found now, not visible with history, never seen, and history unavailable. ElevenLabs SHALL voice the reply in the established Victorian persona.

#### Scenario: Last-seen reply
- **WHEN** the supplied result says keys are absent now and were on the desk at 14:35
- **THEN** the reply states that they are not currently visible and were last seen on the desk at 14:35

### Requirement: Discover durable Pi requests
Web SHALL discover Pi-origin requests and reconstruct their transcript and result from S3 without an earlier HTTP submission from the Pi. Requests uploaded while web is offline SHALL remain discoverable after web starts. Existing web-origin recording and typing flows SHALL remain usable.

#### Scenario: Web restarts after Pi upload
- **WHEN** a complete Pi request and result exist in S3 and web restarts
- **THEN** the open browser can discover that request and hear its narrated result
