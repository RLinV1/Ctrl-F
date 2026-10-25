/** Keep behavior aligned with desktop/targets.py and the shared request fixtures. */
const EMPTY = new Set(["", "it", "them", "something", "anything", "hello", "hello there", "hi", "thanks", "thank you"]);
const PREFIX = /^(?:please\s+)?(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(?:tell me\s+)?(?:where did i (?:put|leave)|where do i find|where's|where(?: (?:is|are))?|find|locate|look for|search for|have you seen|do you see|i(?:'ve| have)? lost|i(?:'m| am) looking for|i (?:need|want))\s+/;
export function itemName(value: string): string | null {
  const name = value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return name.length >= 1 && name.length <= 80 && !EMPTY.has(name) ? name : null;
}

export function extractTargets(transcript: string, known: string[]): string[] {
  if (transcript.length > 1000) return [];
  const said = transcript.normalize("NFKC").toLowerCase().replaceAll("’", "'").trim()
    .replace(PREFIX, "").replace(/[?!.]+$/, "").trim().replace(/[,;]?\s+please$/, "").replace(/\s+(?:is|are|right now)$/, "");
  const aliases = new Map<string, string>();
  for (const canonical of known) {
    const name = itemName(canonical);
    if (name) { aliases.set(name, canonical); if (!aliases.has(name + "s")) aliases.set(name + "s", canonical); }
  }
  const targets: string[] = [];
  for (const phrase of said.split(/\s+(?:and|or)\s+|[,;&]+/)) {
    const name = itemName(phrase.trim().replace(/^(?:(?:my|the|a|an|our|your|some)\s+)+/, ""));
    if (name) { const target = aliases.get(name) ?? name; if (!targets.includes(target)) targets.push(target); }
  }
  return targets.length <= 8 ? targets : [];
}
