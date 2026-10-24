"""ElevenLabs speech-to-text check.

    python dev-test/stt_test.py --selftest          # speak known phrases with TTS, transcribe, score
    python dev-test/stt_test.py --file clip.webm    # transcribe any audio file (wav, mp3, webm, m4a)

--selftest proves the API, scope, and accuracy on clean audio. For real-mic quality, record a clip
(Windows Voice Recorder, or the browser) and pass it with --file.

Reads ELEVENLABS_API_KEY from .env or the environment. Needs: pip install requests
"""
import argparse
import difflib
import os
import re
import sys
import time
from pathlib import Path

import requests

from tts_test import DEFAULT_VOICE, load_env, synthesize

URL = "https://api.elevenlabs.io/v1/speech-to-text"
MODEL = "scribe_v1"
PASS_RATIO = 0.9
# What a user would plausibly say to Ctrl-F. Item names are the part that matters.
PHRASES = [
    "Where are my keys?",
    "Find my wallet.",
    "Have you seen my glasses?",
    "I lost my phone.",
    "Where did I leave the remote?",
    "Can you find my earbuds?",
    "Where is my water bottle?",
]


def transcribe(audio: bytes, filename: str, api_key: str) -> str:
    response = requests.post(
        URL,
        headers={"xi-api-key": api_key},
        data={"model_id": MODEL},
        files={"file": (filename, audio)},
        timeout=60,
    )
    if not response.ok:
        sys.exit(f"ElevenLabs returned {response.status_code}: {response.text[:300]}")
    return response.json().get("text", "").strip()


def normalize(text: str) -> str:
    # Drop punctuation and spaces so "ear buds" and "earbuds" are not scored as an error.
    return re.sub(r"[^a-z0-9]", "", text.lower())


def selftest(api_key: str, voice_id: str) -> bool:
    failures = 0
    for phrase in PHRASES:
        audio = synthesize(phrase, voice_id, api_key)
        started = time.perf_counter()
        heard = transcribe(audio, "phrase.mp3", api_key)
        seconds = time.perf_counter() - started
        ratio = difflib.SequenceMatcher(None, normalize(phrase), normalize(heard)).ratio()
        ok = ratio >= PASS_RATIO
        failures += not ok
        print(f"{'PASS' if ok else 'FAIL'} {ratio:.2f} {seconds:.1f}s  said: {phrase!r}  heard: {heard!r}")
    print(f"{len(PHRASES) - failures}/{len(PHRASES)} phrases matched (threshold {PASS_RATIO})")
    return failures == 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--file", type=Path)
    parser.add_argument("--voice", help="voice ID for --selftest (default: ELEVENLABS_VOICE_ID or George)")
    args = parser.parse_args()
    if not args.selftest and not args.file:
        parser.error("pass --selftest or --file")

    load_env()
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        sys.exit("ELEVENLABS_API_KEY is not set. Put it in .env (see .env.example).")

    if args.file:
        started = time.perf_counter()
        text = transcribe(args.file.read_bytes(), args.file.name, api_key)
        print(f"{time.perf_counter() - started:.1f}s  heard: {text!r}")
    if args.selftest:
        voice_id = args.voice or os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE
        sys.exit(0 if selftest(api_key, voice_id) else 1)


if __name__ == "__main__":
    main()
