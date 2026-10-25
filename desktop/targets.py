"""Bounded item phrases shared in behavior with web/lib/data/targets.ts."""
import re
import unicodedata
from collections.abc import Mapping, Sequence

MAX_TARGETS = 8
MAX_NAME = 80
PREFIX = r"^(?:please\s+)?(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(?:tell me\s+)?(?:where did i (?:put|leave)|where do i find|where's|where(?: (?:is|are))?|find|locate|look for|search for|have you seen|do you see|i(?:'ve| have)? lost|i(?:'m| am) looking for|i (?:need|want)|(?:i )?can(?:not|'t) find)\s+"
# Greeting removal requires a following command so "hi hat" stays an item.
GREETING = r"^(?:(?:yo|hey|hi|hello)(?: there)?[\s,!.:]+)+(?=(?:please|can|could|would|will|tell|where|find|locate|look|search|have|do|i)\b)"
HESITATION = r"[,;]?\s*\b(?:uh+|um+|erm|hmm+)\b\s*[,;]?\s*"
DETERMINER = r"^(?:(?:my|the|a|an|our|your|some)(?:[\s,]+|$))+"
REQUEST_NOISE = {"my", "the", "a", "an", "our", "your", "some", "yo", "hey", "uh", "um", "erm", "hmm", "please", "and", "or", "where", "is", "are"}
EMPTY = {"", "it", "them", "something", "anything", "hello", "hello there", "hi", "thanks", "thank you"}


def item_name(value: str) -> str:
    """Normalize labels without guessing synonyms or discarding descriptors."""
    if not isinstance(value, str):
        raise ValueError("Item name must be text")
    value = re.sub(r"[\W_]+", " ", unicodedata.normalize("NFKC", value).lower()).strip()
    if not 1 <= len(value) <= MAX_NAME or value in EMPTY:
        raise ValueError("Item name must be a bounded object phrase")
    return value


def extract_targets(transcript: str, catalog: Mapping[str, Sequence[str]]) -> list[str]:
    if not isinstance(transcript, str) or len(transcript) > 1000:
        return []
    said = unicodedata.normalize("NFKC", transcript).lower().replace("’", "'").strip()
    said = re.sub(HESITATION, " ", said).strip()
    said = re.sub(GREETING, "", said)
    said = re.sub(PREFIX, "", said)
    said = re.sub(r"[?!.]+$", "", said).strip()
    said = re.sub(r"[,;]?\s+please$", "", said)
    said = re.sub(r"\s+(?:is|are|right now|at)$", "", said)
    aliases = {}
    for name, names in catalog.items():
        try:
            if item_name(name) in REQUEST_NOISE:
                continue
        except ValueError:
            continue
        for alias in [name, *names]:
            try:
                clean = item_name(alias)
            except ValueError:
                continue
            if clean in REQUEST_NOISE:
                continue
            aliases[clean] = name
            aliases.setdefault(clean + "s", name)
    targets = []
    for phrase in re.split(r"\s+(?:and|or)\s+|[,;&]+", said):
        phrase = re.sub(DETERMINER, "", phrase.strip())
        try:
            name = item_name(phrase)
        except ValueError:
            continue
        if name in REQUEST_NOISE:
            continue
        name = aliases.get(name, name)
        if name not in targets:
            targets.append(name)
    return targets if len(targets) <= MAX_TARGETS else []
