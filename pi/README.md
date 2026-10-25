# Raspberry Pi camera and microphone

Run this on the Pi with the Logitech USB webcam and Grove button attached.
The button records from the webcam mic while held; release submits the question.
The browser speaks the answer. Browser-recorded questions use the same camera.

## Install

Python 3.11+ and Raspberry Pi OS:

```sh
sudo apt install fswebcam alsa-utils ffmpeg
python3 -m venv .venv
.venv/bin/python -m pip install -r pi/requirements.txt
arecord -l
```

Use the Logitech capture device from `arecord -l`, preferably its stable card name:

```dotenv
PI_AUDIO_DEVICE=plughw:CARD=Webcam,DEV=0
PI_RECORD_MAX_SECONDS=15
CAPTURE_BUTTON_PIN=5
WEB_BASE_URL=https://your-web-host.example
PI_JOB_TOKEN=<same value configured on the web server>
S3_BUCKET=<your private bucket>
S3_REGION=<bucket region>
S3_ENDPOINT=
S3_ACCESS_KEY_ID=<Pi credential>
S3_SECRET_ACCESS_KEY=<Pi credential>
```

Configure the root `.env` or `~/.ctrlf.env`; real environment variables win and
`~/.ctrlf.env` takes precedence over the root file. The Pi credential needs to list,
read/delete/write `jobs/` and write `incoming/`; it does not need result access.
Use your actual region and card name. The Pi token is sent only to the configured
web endpoint. Use HTTPS when the web server is outside a trusted local network.

## Check the actual hardware

```sh
arecord -D plughw:CARD=Webcam,DEV=0 -f S16_LE -r 16000 -c 1 -d 3 /tmp/ctrlf-mic.wav
aplay /tmp/ctrlf-mic.wav
```

Listen for clear speech, then start the relay from the project root:

```sh
.venv/bin/python pi/capture.py
```

Hold the physical button, ask “Where are my keys?”, and release. Clips shorter
than half a second are discarded; recording stops at the maximum. The recording
is encoded as Ogg/Opus and submitted to `/api/device/jobs`. ElevenLabs STT creates
a job, the Pi claims it from S3, captures a fresh JPEG and uploads metadata with
its UTC capture time before the image. Only one recording/submission and one
camera capture run at a time. Failed camera requests are requeued with the same ID.

For an explicit training photo without audio:

```sh
.venv/bin/python pi/capture.py --now
```

These photos go under `incoming/training/` and are skipped by the search worker.
There is no wake word or Pi speaker playback. Keep the web app open and enable
audio there. An open browser may still require clicking Play for autoplay rules.

Mocked checks: `.venv/bin/python -m pytest -c pi/pytest.ini pi/tests`.
