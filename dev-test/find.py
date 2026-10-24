"""Work out which item the user asked for and whether the model found it. Pure functions, no I/O.

Throwaway copy for dev-test. The real version belongs in desktop/ (spec: target-matching).
Self-check: python dev-test/find.py
"""
import re

# class (or untrained thing a user might ask for) -> words people say for it
ALIASES = {
    "airpods case": ["airpods case", "airpod case", "charging case", "earbud case"],
    "airpods": ["airpods", "airpod", "air pods", "earbuds", "earbud"],
    "charger": ["charger", "chargers", "phone charger", "charging cable", "charge cable", "adapter", "wire", "wires", "cable", "cables", "cord"],
    "phone": ["phone", "cellphone", "cell phone", "smartphone", "iphone", "mobile"],
    "glasses": ["glasses", "eyeglasses", "spectacles", "sunglasses", "specs"],
    "remote": ["remote", "controller", "clicker"],
    "watch": ["watch", "smartwatch"],
    "headphones": ["headphones", "earphones", "headset"],
    "keys": ["keys", "key", "keychain"],
    "wallet": ["wallet", "purse"],
}


# our item -> the name stock COCO weights use for it
COCO_NAMES = {"phone": "cell phone"}


# asking for "airpods" also matches a detected case; asking for the case matches only the case
SAME_ITEM = {"airpods": ("airpods", "airpods case")}


def extract_targets(transcript: str, known: list[str]) -> list[tuple[str, bool]]:
    """Every item named in the transcript, in the order spoken: [(item, supported), ...].

    supported is False for items the loaded model was not trained on.
    """
    text = transcript.lower()
    hits = [(m.start(), m.end(), item) for item, words in ALIASES.items() for w in words
            for m in re.finditer(rf"\b{re.escape(w)}\b", text)]
    # a phrase inside a longer one ("airpods" inside "airpods case") is the same mention
    hits = [h for h in hits if not any(o != h and o[0] <= h[0] and h[1] <= o[1] and o[1] - o[0] > h[1] - h[0] for o in hits)]
    targets: list[tuple[str, bool]] = []
    for _, _, item in sorted(hits):
        item = item if item in known else COCO_NAMES.get(item, item)  # stock weights call it "cell phone"
        if item not in [t[0] for t in targets]:
            targets.append((item, any(name in known for name in SAME_ITEM.get(item, (item,)))))
    return targets


def extract_target(transcript: str, known: list[str]) -> tuple[str | None, bool]:
    """The first item named, or (None, False)."""
    return (extract_targets(transcript, known) or [(None, False)])[0]


def where(box: list[float]) -> str:
    """Normalized x1,y1,x2,y2 -> 'upper left', 'center', ..."""
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    vertical = "upper" if cy < 0.33 else "lower" if cy > 0.66 else ""
    horizontal = "left" if cx < 0.33 else "right" if cx > 0.66 else ""
    return " ".join(part for part in (vertical, horizontal) if part) or "center"


def near(target: dict, detections: list[dict]) -> tuple[str, str] | None:
    """The closest other detected item as (name, 'left of' | 'right of' | 'above' | 'below' the target), or None."""
    def center(d): return (d["box"][0] + d["box"][2]) / 2, (d["box"][1] + d["box"][3]) / 2
    tx, ty = center(target)
    # skip boxes that contain the item (a table it sits on is a surface, not a neighbor)
    others = [d for d in detections if d["name"] != target["name"]
              and not (d["box"][0] <= tx <= d["box"][2] and d["box"][1] <= ty <= d["box"][3])]
    if not others:
        return None
    other = min(others, key=lambda d: (center(d)[0] - tx) ** 2 + (center(d)[1] - ty) ** 2)
    dx, dy = tx - center(other)[0], ty - center(other)[1]
    if abs(dx) >= abs(dy):
        return other["name"], "left of" if dx < 0 else "right of"
    return other["name"], "above" if dy < 0 else "below"


# stock COCO class -> our name for it. Our trained model has a phone class but no phone training data.
STOCK_NAMES = {"cell phone": "phone"}


def merge_detections(own: list[dict], stock: list[dict], own_names: list[str]) -> list[dict]:
    """Add the stock COCO model's detections (chair, laptop, dining table, ...) to the trained model's.

    A stock detection is dropped when the trained model owns that name (its remote beats COCO's), unless the name
    is one we rename from COCO (cell phone -> phone), where it is dropped only if the trained model already boxed
    the same spot.
    """
    def iou(a, b):
        w = min(a[2], b[2]) - max(a[0], b[0]); h = min(a[3], b[3]) - max(a[1], b[1])
        inter = max(w, 0) * max(h, 0)
        return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter or 1)

    merged = list(own)
    for d in stock:
        name = STOCK_NAMES.get(d["name"], d["name"])
        if name in own_names and d["name"] not in STOCK_NAMES:
            continue
        if any(o["name"] == name and iou(o["box"], d["box"]) > 0.5 for o in own):
            continue
        merged.append({**d, "name": name})
    return merged


def match(target: str, detections: list[dict]) -> list[dict]:
    names = SAME_ITEM.get(target, (target,))
    return sorted((d for d in detections if d["name"] in names), key=lambda d: -d["conf"])


def describe(target: str | None, supported: bool, matches: list[dict], known: list[str], detections: list[dict] = ()) -> tuple[str, str]:
    """Return (status, plain-English message)."""
    if target is None:
        return "no_target", f"I did not catch an item I know. I can look for: {', '.join(known)}."
    if not supported:
        return "unsupported", f"I can't look for {target} yet; the model was not trained on it. I can look for: {', '.join(known)}."
    if not matches:
        return "not_visible", f"I don't see {target} in this photo."
    best = round(matches[0]["conf"] * 100)
    extra = f" ({len(matches)} spots)" if len(matches) > 1 else ""
    place = f"in the {where(matches[0]['box'])} of the photo"
    rel = near(matches[0], detections)
    beside = f", {rel[1]} the {rel[0]}" if rel else ""
    return "found", f"Found {target}, {best}% sure{extra}, {place}{beside}."


def describe_all(targets: list[tuple[str, bool]], detections: list[dict], known: list[str]) -> dict:
    """One answer for everything the user asked for: per-item results plus a combined message.

    status is "found" when every item was found, "partial" when only some were, else the first item's status.
    matches holds the boxes of every requested item, so the page can label them all.
    """
    if not targets:
        status, message = describe(None, False, [], known)
        return {"status": status, "message": message, "items": [], "matches": []}
    items = []
    for item, supported in targets:
        matches = match(item, detections) if supported else []
        status, message = describe(item, supported, matches, known, detections)
        items.append({"item": item, "status": status, "message": message, "matches": matches})
    found = [i for i in items if i["status"] == "found"]
    status = "found" if len(found) == len(items) else "partial" if found else items[0]["status"]
    return {"status": status, "message": " ".join(i["message"] for i in items), "items": items,
            "matches": [m for i in items for m in i["matches"]]}


if __name__ == "__main__":
    assert extract_targets("where are my keys and wallet", ["keys", "wallet"]) == [("keys", True), ("wallet", True)]
    assert extract_targets("find my wallet, then my keys", ["keys", "wallet"]) == [("wallet", True), ("keys", True)]  # order spoken
    assert extract_targets("where is my airpods case", ["airpods case", "airpods"]) == [("airpods case", True)]  # one mention, not two
    assert extract_targets("my phone charger and my keys", ["charger", "keys"]) == [("charger", True), ("keys", True)]
    assert extract_targets("keys keys keys", ["keys"]) == [("keys", True)]
    d = lambda n, x: {"name": n, "conf": 0.9, "box": [x, 0.4, x + 0.1, 0.5]}
    both = describe_all([("keys", True), ("wallet", True)], [d("keys", 0.1), d("wallet", 0.7)], ["keys", "wallet"])
    assert both["status"] == "found" and len(both["matches"]) == 2 and both["message"].count("Found") == 2
    some = describe_all([("keys", True), ("wallet", True)], [d("keys", 0.1)], ["keys", "wallet"])
    assert some["status"] == "partial" and "I don't see wallet" in some["message"] and len(some["matches"]) == 1
    assert describe_all([], [], ["keys"])["status"] == "no_target"
    known = ["phone", "glasses", "remote", "watch", "headphones"]
    assert extract_target("Where are my glasses?", known) == ("glasses", True)
    assert extract_target("have you seen my cell phone", known) == ("phone", True)
    assert extract_target("where is my phone", ["cell phone", "remote"]) == ("cell phone", True)  # stock COCO
    assert extract_target("find my keys", known) == ("keys", False)  # real item, not trained yet
    assert extract_target("where is my airpods case", known) == ("airpods case", False)  # longest phrase wins
    assert extract_target("where are my airpods", ["airpods case"]) == ("airpods", True)  # either class counts
    assert extract_target("where is my airpods case", ["airpods"]) == ("airpods case", False)  # case is its own class
    assert [d["name"] for d in match("airpods", [{"name": "airpods case", "conf": 0.7}, {"name": "airpods", "conf": 0.5}])] == ["airpods case", "airpods"]
    assert [d["name"] for d in match("airpods case", [{"name": "airpods case", "conf": 0.7}, {"name": "airpods", "conf": 0.5}])] == ["airpods case"]
    own = [{"name": "keys", "conf": 0.9, "box": [0.1, 0.1, 0.2, 0.2]}]
    stock = [{"name": "remote", "conf": 0.5, "box": [0.5, 0.5, 0.6, 0.6]}, {"name": "chair", "conf": 0.8, "box": [0, 0, 1, 1]},
             {"name": "cell phone", "conf": 0.8, "box": [0.3, 0.3, 0.4, 0.4]}]
    merged = merge_detections(own, stock, ["keys", "remote", "phone"])
    assert [d["name"] for d in merged] == ["keys", "chair", "phone"]  # our remote class wins; cell phone renamed
    assert merge_detections([{"name": "phone", "conf": 0.9, "box": [0.3, 0.3, 0.4, 0.4]}], stock[2:], ["phone"]) == [{"name": "phone", "conf": 0.9, "box": [0.3, 0.3, 0.4, 0.4]}]
    assert extract_target("hello there", known) == (None, False)
    assert extract_target("keyboard", ["keys"]) == (None, False)  # whole words only
    b = [0.1, 0.1, 0.2, 0.2]
    dets = [{"name": "phone", "conf": 0.6, "box": b}, {"name": "phone", "conf": 0.9, "box": b}, {"name": "watch", "conf": 0.8, "box": b}]
    assert [d["conf"] for d in match("phone", dets)] == [0.9, 0.6]
    assert match("remote", dets) == []
    assert describe("phone", True, match("phone", dets), known)[0] == "found"
    assert describe("remote", True, [], known)[0] == "not_visible"
    box = lambda n, x: {"name": n, "conf": 0.9, "box": [x, 0.4, x + 0.1, 0.5]}
    assert near(box("phone", 0.1), [box("phone", 0.1), box("watch", 0.6)]) == ("watch", "left of")
    assert near(box("phone", 0.1), [box("phone", 0.1)]) is None
    table = {"name": "dining table", "conf": 0.9, "box": [0.0, 0.0, 1.0, 1.0]}
    assert near(box("phone", 0.1), [box("phone", 0.1), table]) is None  # surface under the item is ignored
    assert near(box("phone", 0.1), [box("phone", 0.1), table, box("watch", 0.6)]) == ("watch", "left of")
    assert describe("phone", True, [box("phone", 0.1)], known, [box("phone", 0.1), box("watch", 0.6)])[1].endswith("in the left of the photo, left of the watch.")
    assert describe("keys", False, [], known)[0] == "unsupported"
    assert describe(None, False, [], known)[0] == "no_target"
    print("find.py self-check passed")
