## 1. Desktop service scaffold

- [ ] 1.1 Create `desktop/` with a Python 3.11 project (`pyproject.toml`, `fastapi`, `uvicorn`, `ultralytics`, `python-multipart`, `pytest`) and verify `pytest` runs with zero tests collected
- [ ] 1.2 Add `.env.example` entries `YOLO_WEIGHTS_PATH` and `DESKTOP_BASE_URL`, add `.gitignore` rules for weights and `.env`, and verify `git status` shows no weight files

## 2. Object detection endpoint

- [ ] 2.1 Load weights from `YOLO_WEIGHTS_PATH` at startup, failing with an error that names the path when missing; verify with a test that starts the app against a bad path
- [ ] 2.2 Implement `POST /detect` returning `{ detections: [{ label, confidence, bbox }] }` with normalized boxes; verify with a contract test using a fixture JPEG and a stubbed model
- [ ] 2.3 Return `400` for missing or undecodable uploads without running the model; verify with a test posting garbage bytes
- [ ] 2.4 Implement `GET /health` returning `ok`, `gpu`, and model identifier; verify with a test
- [ ] 2.5 Run `/detect` once with real stock weights on a photo containing a COCO object and verify the expected label appears (slow test, marked and skipped by default)

## 3. Target matching

- [ ] 3.1 Implement the pure `match(target, aliases, detections, classes)` function returning `matched`, `not_visible`, or `unsupported`, ordered by confidence; verify with table-driven unit tests covering exact, alias, multiple, absent, and untrained cases from the spec

## 4. Pi service

- [ ] 4.1 Create `pi/` with a Python project and a single `grab_jpeg()` function around the camera library (resolution and quality configurable); verify on the Pi that it returns a decodable JPEG
- [ ] 4.2 Implement `GET /capture` (`image/jpeg`, `503` with `error` when the camera fails) and `GET /health`; verify with tests that stub `grab_jpeg` for both success and failure
- [ ] 4.3 Write `pi/README.md` with the exact Pi OS, camera module, and install steps that worked, and verify a clean setup from the README on the Pi

## 5. Relay and end-to-end check

- [ ] 5.1 Implement the Pi relay script: capture a frame, post it to `{DESKTOP_BASE_URL}/detect`, print detections, and exit non-zero naming the URL when the desktop is unreachable; verify with a test against a stub server and a test with an unreachable URL
- [ ] 5.2 Add a `--target <name>` option to the relay that prints the match result; verify by running it on the Pi with a COCO object in view and confirming a `matched` result, then with the object removed and confirming `not_visible`
- [ ] 5.3 Measure and record Pi-to-detections latency over the LAN in `pi/README.md`; verify the number is written down

## 6. Documentation

- [ ] 6.1 Update `docs/ARCHITECTURE.md` and `docs/TECH_STACK.md` if any contract or env var changed during implementation, and verify the docs match the running code
