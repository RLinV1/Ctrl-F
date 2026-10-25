"""Bounded webcam microphone recording without blocking GPIO callbacks."""

import logging
import math
import signal
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from collections.abc import Callable

log = logging.getLogger(__name__)


class VoiceButton:
    def __init__(self, device: str, submit: Callable[[bytes], object], maximum: float = 15) -> None:
        if not device or not callable(submit):
            raise ValueError("PI_AUDIO_DEVICE and an upload queue are required")
        if not math.isfinite(maximum) or not 0.5 <= maximum <= 60:
            raise ValueError("PI_RECORD_MAX_SECONDS must be between 0.5 and 60")
        self.device, self.submit, self.maximum = device, submit, maximum
        self._lock = threading.Lock()
        self._released = threading.Event()
        self._thread: threading.Thread | None = None

    def press(self) -> None:
        if not self._lock.acquire(blocking=False):
            return
        self._released.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def release(self) -> None:
        self._released.set()

    def _run(self) -> None:
        try:
            with tempfile.TemporaryDirectory(prefix="ctrlf-audio-") as directory:
                audio = self.record(Path(directory))
                if audio is not None:
                    self.submit(audio)
        except Exception:
            log.warning("Microphone recording or local queue failed; check audio device and spool permissions")
        finally:
            self._lock.release()

    def record(self, directory: Path) -> bytes | None:
        """Record WAV, release or duration limit stops it, encode supported Ogg/Opus."""
        wav, ogg = directory / "request.wav", directory / "request.ogg"
        start = time.monotonic()
        process = subprocess.Popen(["arecord", "-D", self.device, "-f", "S16_LE", "-r", "16000", "-c", "1", str(wav)],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            # Poll for device failure as well as release; callbacks never wait here.
            while not self._released.wait(0.05):
                if process.poll() is not None or time.monotonic() - start >= self.maximum:
                    break
            duration = time.monotonic() - start
            if process.poll() is not None:
                raise RuntimeError("Microphone capture stopped unexpectedly")
            process.send_signal(signal.SIGINT)  # Finalizes the WAV header.
            process.wait(timeout=3)
            if process.returncode not in (0, 1, -signal.SIGINT):
                raise RuntimeError("Microphone capture failed")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=3)
        if duration < 0.5:
            return None
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-c:a", "libopus", str(ogg)],
                       check=True, timeout=15, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return ogg.read_bytes()
