"""Gemini narrator: a witty steampunk Sherlock Holmes who words the reply. Text in, text out. No photos.

    python dev-test/narrator.py        # runs four sample results through Gemini

Gemini never picks the item or reads the photo; it only phrases a result the vision system already produced.
Reads GEMINI_API_KEY (and optional GEMINI_MODEL) from .env or the environment. Needs: pip install requests
"""
import json
import os
import sys

import requests
from tts_test import load_env

# "-latest" alias follows Google's current model; pin an exact name in GEMINI_MODEL for stable behavior.
MODEL = "gemini-flash-lite-latest"
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SYSTEM_PROMPT = """You are Sherlock Holmes, reborn as a witty steampunk inventor-detective, and you are the voice of Ctrl-F, a brass-and-gears device that finds lost belongings.

You receive a JSON result from the machine's vision system. Reply to the user in character, in one or two short sentences that sound good read aloud.

Rules:
- Report only what the JSON says. Never invent items, places, or objects that are not in it.
- Say plainly whether the item was found. If found, give where it is in the frame using the "where" field.
- If status is "not_visible", say it is not in view and suggest checking another spot.
- If status is "unsupported", say you cannot yet seek that item.
- If status is "no_target", ask what they are looking for.
- If status is "trouble", say the machinery has hit a snag and ask them to try again. Name the problem in plain words only if it helps them (no jargon, no error codes, no file names).
- Always use the item's plain name (for example "phone", not a nickname). Never offer actions you cannot do, such as fetching or retrieving it.
- Wit and Victorian flourish are welcome, but the answer must be clear first. No emojis, no stage directions, no mention of JSON."""


def where(box: list[float]) -> str:
    """Normalized x1,y1,x2,y2 -> 'upper left', 'center', ..."""
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    vertical = "upper" if cy < 0.33 else "lower" if cy > 0.66 else ""
    horizontal = "left" if cx < 0.33 else "right" if cx > 0.66 else ""
    return " ".join(part for part in (vertical, horizontal) if part) or "center"


def narrate(result: dict, api_key: str, model: str = MODEL) -> str:
    """result: the dict from /api/find (status, target, matches, ...)."""
    facts = {"status": result["status"], "item": result.get("target")}
    if result.get("matches"):
        facts["where"] = where(result["matches"][0]["box"])
        facts["confidence_percent"] = round(result["matches"][0]["conf"] * 100)
    if result.get("problem"):
        facts["problem"] = result["problem"]
    if result["status"] == "no_target":
        facts["items_i_can_find"] = result.get("known", [])
    response = requests.post(
        URL.format(model=model),
        headers={"x-goog-api-key": api_key},
        json={
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": json.dumps(facts)}]}],
            "generationConfig": {"temperature": 0.9, "maxOutputTokens": 400},
        },
        timeout=30,
    )
    if not response.ok:
        sys.exit(f"Gemini returned {response.status_code}: {response.text[:300]}")
    parts = response.json()["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts).strip()


SAMPLES = [
    {"status": "found", "target": "glasses", "matches": [{"box": [0.1, 0.5, 0.3, 0.7], "conf": 0.91}]},
    {"status": "not_visible", "target": "phone", "matches": []},
    {"status": "unsupported", "target": "airpods case", "matches": []},
    {"status": "no_target", "target": None, "matches": [], "known": ["phone", "glasses", "remote"]},
]

if __name__ == "__main__":
    load_env()
    key = os.environ.get("GEMINI_API_KEY") or sys.exit("GEMINI_API_KEY is not set. Put it in .env.")
    model = os.environ.get("GEMINI_MODEL") or MODEL
    print(f"model: {model}")
    for sample in SAMPLES:
        print(f"[{sample['status']}] {narrate(sample, key, model)}")
