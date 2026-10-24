## Purpose

Lets the desktop turn an uploaded photo into a list of detected objects using the configured YOLO weights, so downstream features can look for specific items.

## ADDED Requirements

### Requirement: Detect objects in an uploaded image
The desktop service SHALL respond to `POST /detect` with a JPEG upload by returning every detection above the configured confidence threshold as `{ "detections": [{ "label", "confidence", "bbox" }] }`. `confidence` SHALL be between 0 and 1. `bbox` SHALL be `{ "x", "y", "w", "h" }` normalized to the image size, with values between 0 and 1.

#### Scenario: Image with detectable objects
- **WHEN** a client posts a valid JPEG containing objects the model knows
- **THEN** the service responds `200` with one entry per detection, each with a label, a confidence, and a normalized bounding box

#### Scenario: Image with nothing detected
- **WHEN** a client posts a valid JPEG and no detection passes the threshold
- **THEN** the service responds `200` with `{ "detections": [] }`

### Requirement: Reject invalid input
The service SHALL respond `400` with an `error` message when the upload is missing or is not a decodable image.

#### Scenario: Not an image
- **WHEN** a client posts a body that cannot be decoded as an image
- **THEN** the service responds `400` and does not run the model

### Requirement: Weights are configurable and reported
The service SHALL load the model from the path in `YOLO_WEIGHTS_PATH` at startup and SHALL report the loaded model identifier from `GET /health`. If the weights cannot be loaded, the service SHALL fail to start with a message naming the path.

#### Scenario: Health shows the model
- **WHEN** a client sends `GET /health` after a successful start
- **THEN** the response includes `ok: true`, whether a GPU is in use, and the model identifier

#### Scenario: Missing weights
- **WHEN** the service starts and the weights file does not exist
- **THEN** startup fails with an error naming `YOLO_WEIGHTS_PATH` and the missing path
