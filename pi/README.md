# Raspberry Pi: S3-only voice and camera relay

The Grove button records the Logitech webcam microphone while held. On release,
Pi saves the recording and takes a fresh photo locally, then uploads both to
private S3. A ready manifest is written last. **No web address, web token, database,
Hermes key, Gemini key, or ElevenLabs key is required on the Pi.**

## Install on the Pi

```sh
sudo apt install fswebcam alsa-utils ffmpeg python3-venv
python3 -m venv --system-site-packages .venv
.venv/bin/python -m pip install -r pi/requirements.txt
arecord -l
```

The system-site-packages option retains the Pi OS GPIO bindings. The service user
needs audio, video and GPIO access. This deployment uses a Logitech Brio 101 whose
stable device name is `plughw:CARD=B101,DEV=0`; inspect your hardware rather than
assuming a numeric card index stays fixed.

## Configuration: ~/.ctrlf.env

Preserve existing credentials and add the Pi settings to **`~/.ctrlf.env`**:

```dotenv
S3_BUCKET=<same bucket used by desktop and web>
S3_REGION=us-east-1
S3_ENDPOINT=
S3_ACCESS_KEY_ID=<Pi credential>
S3_SECRET_ACCESS_KEY=<Pi credential>
PI_AUDIO_DEVICE=plughw:CARD=B101,DEV=0
PI_RECORD_MAX_SECONDS=15
CAPTURE_BUTTON_PIN=5
# Optional; default ~/.local/state/ctrlf/requests
PI_SPOOL_DIR=
```

Use the actual bucket/region/endpoint. Real environment variables win, followed
by `~/.ctrlf.env`; the repo-root `.env` is only a fallback. Restrict the config
file to its owner (`chmod 600 ~/.ctrlf.env`).

S3 permissions: list/read/delete/write `jobs/` for browser-origin captures and
upload under `incoming/` for photos, audio and ready manifests. No result reads
are needed by Pi. Audio and photos remain private.

## Run and verify

```sh
.venv/bin/python pi/capture.py
```

Hold for speech, release to submit. Clips shorter than 0.5 seconds are discarded;
recording stops after the configured maximum (default 15 seconds). The microphone
and camera are serialized appropriately. Local pending requests survive restart
and uploads retry without changing the request ID. Keep sufficient disk space
for queued recordings when S3 is unreachable.

Example systemd **user** service (adjust paths for the actual user):

```ini
[Unit]
Description=Ctrl-F Pi S3 voice and camera relay

[Service]
WorkingDirectory=/home/raymond/Ctrl-F
EnvironmentFile=/home/raymond/.ctrlf.env
Environment=PYTHONUNBUFFERED=1
Environment=GPIOZERO_PIN_FACTORY=lgpio
ExecStart=/home/raymond/Ctrl-F/.venv/bin/python /home/raymond/Ctrl-F/pi/capture.py
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
```

Install as `~/.config/systemd/user/ctrlf-pi.service`, then:

```sh
systemctl --user daemon-reload
systemctl --user enable --now ctrlf-pi.service
journalctl --user -u ctrlf-pi.service -f
```

User lingering must be enabled for unattended boot (`loginctl enable-linger`).

## S3 protocol

One UUID identifies:

- `incoming/device/<uuid>.ogg`: recorded audio.
- `incoming/device/<uuid>.jpeg`: the release-time photo.
- `incoming/device/<uuid>.ready.json`: version, source, UUID, UTC creation/capture
  times and exact audio/image keys. Published only after both uploads finish.

`.jpeg` prevents older `.jpg`-only workers from prematurely consuming the new
request. Upgrade desktop for ready-manifest/STT support, and web for S3 device
job discovery. Pi can queue requests before either service is available.

Desktop needs its own ElevenLabs STT credential. Web keeps Gemini narration and
ElevenLabs speech through the open browser. The Pi never plays production replies
through a speaker. Raw audio stays in private S3 until the operator applies their
chosen retention policy; no bucket lifecycle rule is created automatically.

For a training-only photo (not an end-to-end voice test):

```sh
.venv/bin/python pi/capture.py --now
```

These images stay under `incoming/training/` and the search worker ignores them.

Mocked checks: `.venv/bin/python -m pytest -c pi/pytest.ini pi/tests`.
Hardware checks should validate ALSA recording, Ogg encoding, webcam JPEG output
and GPIO input before testing the full voice loop.
