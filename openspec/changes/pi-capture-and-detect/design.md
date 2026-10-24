## Context

Nothing is built yet; `pi/` and `desktop/` do not exist. See `proposal.md` for motivation and `docs/ARCHITECTURE.md` for the overall system. In the full system the Pi captures a photo for a job and forwards it to the desktop on the LAN. M1 builds only that Pi-to-desktop path, without jobs, voice, or storage.

Constraints: the Pi has no microphone and runs no models. The desktop has the GPU. Python on both ends.

## Goals / Non-Goals

**Goals:**
- A frame can go camera to detections end to end with one command.
- The detection service and matcher are reusable unchanged by M2 and M3.
- Works with stock COCO weights now, custom weights later, with no code change.

**Non-Goals:**
- Auth between Pi and desktop (LAN only for M1; revisit in M2 when jobs arrive).
- Batching, streaming, or async queues.
- Model training or evaluation.

## Decisions

**1. Desktop `/detect` takes an uploaded JPEG; the Pi pushes.**
The Pi POSTs the photo. Alternative: the desktop pulls `GET {PI}/capture`. Push matches the final architecture (the Pi, not the desktop, knows when a job is claimed) and means the desktop never needs the Pi's address. `GET /capture` still exists on the Pi for debugging and for testing the camera alone.

**2. FastAPI on both sides.**
One framework, one test style. The Pi service is tiny. Alternative Flask on the Pi saves little and splits tooling.

**3. Matching is a pure function in its own module.**
`match(target, aliases, detections, classes) -> MatchResult`. No I/O, so it is unit-testable and the later pipeline calls it directly. The result has three states: `matched`, `not_visible`, `unsupported`, which supports the narrator's different replies.

**4. Normalized bounding boxes.**
Return `x, y, w, h` as fractions of image size so the web UI can draw overlays at any size, and so the contract does not depend on camera resolution.

**5. Weights path from env, fail fast.**
`YOLO_WEIGHTS_PATH` is read at startup and the model is loaded once. A missing file stops startup with a clear error rather than failing on the first request. Alternative lazy loading hides misconfiguration until a user asks for something.

**6. Camera access behind one small function.**
`pi/` wraps `picamera2` (or OpenCV as fallback) in a single `grab_jpeg()` function so the camera library can change without touching the endpoints, and tests can substitute a fixture image.

**7. Tests.**
Desktop: `pytest` with a fixture JPEG and a stubbed model for contract tests, plus one slow test with real stock weights. Pi: `pytest` with `grab_jpeg` stubbed. Matching: table-driven unit tests. Playwright is not used here; it applies to the website only.

## Risks / Trade-offs

- [Stock COCO weights cannot detect keys or wallets] → M1 verifies the pipeline with COCO items (cup, phone, laptop). Custom classes arrive with the training work in `docs/TRAINING.md`.
- [Pi camera libraries differ by OS release and camera module] → Isolate behind `grab_jpeg()`; record the exact working setup in `pi/README.md`.
- [Large JPEGs over Wi-Fi add latency] → Cap capture resolution (default 1280 px wide) and JPEG quality; make both configurable.
- [No auth on `/detect`] → Acceptable on a private LAN for M1; the desktop binds to the LAN interface only and must not be port-forwarded.
- [GPU not available on the desktop] → Service runs on CPU and reports `gpu: false` in `/health`.

## Open Questions

- Exact Pi camera module and OS version (determines `picamera2` vs OpenCV). Can be answered at implementation time without changing specs.
