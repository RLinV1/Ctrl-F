/** Keep behavior aligned with desktop/targets.py and the shared request fixtures. */
const EMPTY = new Set(["", "it", "them", "something", "anything", "hello", "hello there", "hi", "thanks", "thank you"]);
const PREFIX = /^(?:please\s+)?(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(?:tell me\s+)?(?:where did i (?:put|leave)|where do i find|where's|where(?: (?:is|are))?|find|locate|look for|search for|have you seen|do you see|i(?:'ve| have)? lost|i(?:'m| am) looking for|i (?:need|want)|(?:i )?can(?:not|'t) find)\s+/;
// Require a following command; a direct item such as "hi hat" keeps its name.
const GREETING = /^(?:(?:yo|hey|hi|hello)(?: there)?[\s,!.:]+)+(?=(?:please|can|could|would|will|tell|where|find|locate|look|search|have|do|i)\b)/;
const HESITATION = /[,;]?\s*\b(?:uh+|um+|erm|hmm+)\b\s*[,;]?\s*/g;
const DETERMINER = /^(?:(?:my|the|a|an|our|your|some)(?:[\s,]+|$))+/;
const REQUEST_NOISE = new Set(["my", "the", "a", "an", "our", "your", "some", "yo", "hey", "uh", "um", "erm", "hmm", "please", "and", "or", "where", "is", "are"]);
export function itemName(value: string): string | null {
  const name = value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return name.length >= 1 && name.length <= 80 && !EMPTY.has(name) ? name : null;
}

export function extractTargets(transcript: string, known: string[]): string[] {
  if (transcript.length > 1000) return [];
  const said = transcript.normalize("NFKC").toLowerCase().replaceAll("’", "'").trim()
    .replace(HESITATION, " ").trim().replace(GREETING, "").replace(PREFIX, "").replace(/[?!.]+$/, "").trim().replace(/[,;]?\s+please$/, "").replace(/\s+(?:is|are|right now|at)$/, "");
  const aliases = new Map<string, string>();
  for (const canonical of known) {
    const name = itemName(canonical);
    if (name && !REQUEST_NOISE.has(name)) { aliases.set(name, canonical); if (!aliases.has(name + "s")) aliases.set(name + "s", canonical); }
  }
  const targets: string[] = [];
  for (const phrase of said.split(/\s+(?:and|or)\s+|[,;&]+/)) {
    const name = itemName(phrase.trim().replace(DETERMINER, ""));
    if (name && !REQUEST_NOISE.has(name)) { const target = aliases.get(name) ?? name; if (!targets.includes(target)) targets.push(target); }
  }
  return targets.length <= 8 ? targets : [];
}
