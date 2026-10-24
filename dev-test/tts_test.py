"""ElevenLabs text-to-speech check with a British voice.

    python dev-test/tts_test.py
    python dev-test/tts_test.py "Your keys are on the desk, old chap." --play
    python dev-test/tts_test.py --voice <voice_id>

Reads ELEVENLABS_API_KEY (and optional ELEVENLABS_VOICE_ID) from .env or the environment.
No third-party packages needed.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).parent / "out" / "tts.mp3"
# George: ElevenLabs premade British male voice. Override with --voice or ELEVENLABS_VOICE_ID.
DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"
MODEL = "eleven_flash_v2_5"  # low latency, fits the 10 s voice-loop budget
DEFAULT_TEXT = "Splendid news! Your keys are resting upon the mahogany desk, just beside the brass lamp."


def load_env() -> None:
    """Minimal .env reader so the script needs no python-dotenv."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def synthesize(text: str, voice_id: str, api_key: str) -> bytes:
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        data=json.dumps({"text": text, "model_id": MODEL}).encode(),
        headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        # ElevenLabs puts the reason in the JSON body, e.g. a missing scope or unknown voice.
        sys.exit(f"ElevenLabs returned {error.code}: {error.read().decode(errors='replace')[:300]}")
    except urllib.error.URLError as error:
        sys.exit(f"Could not reach ElevenLabs: {error.reason}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("text", nargs="?", default=DEFAULT_TEXT)
    parser.add_argument("--voice", help="voice ID (default: ELEVENLABS_VOICE_ID or George)")
    parser.add_argument("--play", action="store_true", help="open the mp3 in the default player (Windows)")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        sys.exit("ELEVENLABS_API_KEY is not set. Put it in .env (see .env.example).")
    voice_id = args.voice or os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE

    audio = synthesize(args.text, voice_id, api_key)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_bytes(audio)
    print(f"OK voice {voice_id}, model {MODEL}: {len(audio) // 1024} KB -> {OUT}")
    if args.play:
        os.startfile(OUT)  # shortcut: Windows only; use a player command on macOS/Linux


if __name__ == "__main__":
    main()
