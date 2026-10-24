## Purpose

Lets the desktop obtain a current photo from the Raspberry Pi camera and lets the Pi forward a photo to the desktop, so later milestones can build the voice and web flow on top of a working camera path.

## ADDED Requirements

### Requirement: Pi returns a current frame on request
The Pi service SHALL respond to `GET /capture` with a JPEG image of the current camera frame, using content type `image/jpeg`.

#### Scenario: Successful capture
- **WHEN** a client sends `GET /capture` and the camera is available
- **THEN** the service responds `200` with `Content-Type: image/jpeg` and a decodable JPEG body

#### Scenario: Camera unavailable
- **WHEN** a client sends `GET /capture` and the camera cannot produce a frame
- **THEN** the service responds `503` with a JSON body containing an `error` message

### Requirement: Pi reports health
The Pi service SHALL respond to `GET /health` with `{ "ok": true }` when it is running and able to reach its camera, and `{ "ok": false }` otherwise.

#### Scenario: Healthy
- **WHEN** a client sends `GET /health` and the camera is available
- **THEN** the service responds `200` with `{ "ok": true }`

#### Scenario: Camera missing
- **WHEN** a client sends `GET /health` and the camera is not available
- **THEN** the service responds `503` with `{ "ok": false }`

### Requirement: Pi relays a frame to the desktop
The Pi relay SHALL capture one frame and send it to the desktop detection endpoint at the configured desktop base URL, then output the detections the desktop returns.

#### Scenario: Relay succeeds
- **WHEN** the relay runs and both the camera and the desktop service are available
- **THEN** the relay posts the JPEG to `{DESKTOP_BASE_URL}/detect` and prints the returned detections

#### Scenario: Desktop unreachable
- **WHEN** the relay runs and the desktop service cannot be reached
- **THEN** the relay exits with a non-zero status and a message naming the unreachable URL
