"""Work out which item the user asked for and whether the model found it. Pure functions, no I/O.

Throwaway copy for dev-test. The real version belongs in desktop/ (spec: target-matching).
Self-check: python dev-test/find.py
"""
import re

# class (or untrained thing a user might ask for) -> words people say for it
ALIASES = {
    "airpods case": ["airpods case", "airpod case", "charging case", "earbud case"],
    "airpods": ["airpods", "airpod", "air pods", "earbuds", "earbud"],
    "wires": ["wire", "wires", "cable", "cables", "charger", "cord"],
    "phone": ["phone", "cellphone", "cell phone", "smartphone", "iphone", "mobile"],
    "glasses": ["glasses", "eyeglasses", "spectacles", "sunglasses", "specs"],
    "remote": ["remote", "controller", "clicker"],
    "watch": ["watch", "smartwatch"],
    "headphones": ["headphones", "earphones", "headset"],
    "keys": ["keys", "key", "keychain"],
    "wallet": ["wallet", "purse"],
}


def extract_target(transcript: str, known: list[str]) -> tuple[str | None, bool]:
    """Return (item, supported). supported is False for items the loaded model was not trained on."""
    text = transcript.lower()
    for item, words in ALIASES.items():
        if any(re.search(rf"\b{re.escape(w)}\b", text) for w in words):
            return item, item in known
    return None, False


def match(target: str, detections: list[dict]) -> list[dict]:
    return sorted((d for d in detections if d["name"] == target), key=lambda d: -d["conf"])


def describe(target: str | None, supported: bool, matches: list[dict], known: list[str]) -> tuple[str, str]:
    """Return (status, plain-English message)."""
    if target is None:
        return "no_target", f"I did not catch an item I know. I can look for: {', '.join(known)}."
    if not supported:
        return "unsupported", f"I can't look for {target} yet; the model was not trained on it. I can look for: {', '.join(known)}."
    if not matches:
        return "not_visible", f"I don't see {target} in this photo."
    best = round(matches[0]["conf"] * 100)
    extra = f" ({len(matches)} spots)" if len(matches) > 1 else ""
    return "found", f"Found {target}, {best}% sure{extra}. Highlighted in the photo."


if __name__ == "__main__":
    known = ["phone", "glasses", "remote", "watch", "headphones"]
    assert extract_target("Where are my glasses?", known) == ("glasses", True)
    assert extract_target("have you seen my cell phone", known) == ("phone", True)
    assert extract_target("find my keys", known) == ("keys", False)  # real item, not trained yet
    assert extract_target("where is my airpods case", known) == ("airpods case", False)  # longest phrase wins
    assert extract_target("hello there", known) == (None, False)
    assert extract_target("keyboard", ["keys"]) == (None, False)  # whole words only
    dets = [{"name": "phone", "conf": 0.6}, {"name": "phone", "conf": 0.9}, {"name": "watch", "conf": 0.8}]
    assert [d["conf"] for d in match("phone", dets)] == [0.9, 0.6]
    assert match("remote", dets) == []
    assert describe("phone", True, match("phone", dets), known)[0] == "found"
    assert describe("remote", True, [], known)[0] == "not_visible"
    assert describe("keys", False, [], known)[0] == "unsupported"
    assert describe(None, False, [], known)[0] == "no_target"
    print("find.py self-check passed")
