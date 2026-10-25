import { extractTargets } from "./targets";
/** Ported from main's dev-test/find.py and dev-test/narrator.py: where() and near() word a box, Gemini words the reply, ElevenLabs does STT and TTS. */
import type { WordTime } from "./types";

export type Detection = { name: string; conf: number | null; location_description?: string | null; box: [number, number, number, number] };
export type HistoryEvidence = { detection_id: string; photo_id: string; item_id: string; seen_at: string; label: string;
  confidence: number | null; bbox: { x: number; y: number; w: number; h: number }; location_description: string | null;
  zone: string | null; s3_key: string; annotated_key: string | null; width: number; height: number };
export type HistoryStatus = "available" | "never_seen" | "unavailable" | "not_needed";
export type ItemResult = { item: string; status: "found" | "not_visible"; matches: Detection[];
  history_status?: HistoryStatus; last_sighting?: HistoryEvidence | null };
/** results/<id>_result.json, written by desktop/server.py. `unsupported` is added here for a request that names no known item. */
export type Result = {
  status: "found" | "not_visible" | "no_target" | "unsupported" | "failed";
  source?: "web" | "device"; transcript?: string; targets?: string[]; created_at?: string;
  version?: number; captured_at?: string; history_status?: HistoryStatus; last_sighting?: HistoryEvidence | null; error?: string;
  target: string | null;
  matches: Detection[];
  items?: ItemResult[];
  detections: Detection[];
  known?: string[];
  width?: number;
  height?: number;
};

/** Used until a result tells us what the running model can find: the classes in training/classes.py on main. */
export const KNOWN_ITEMS = ["phone", "glasses", "remote", "watch", "headphones", "keys", "wallet", "airpods case", "airpods", "charger"];

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite" // about 0.6 s a reply; "gemini-flash-lite-latest" took about 4 s;
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George, British

const SYSTEM_PROMPT = `You are Sherlock Holmes, reborn as a witty steampunk inventor-detective, and you are the voice of Ctrl-F, a brass-and-gears device that finds lost belongings.

You receive a JSON result from the machine's vision system. Reply to the user in character, in one or two short sentences that sound good read aloud.

Rules:
- Report only what the JSON says. Never invent items, places, or objects that are not in it.
- If "items" lists several things, say about each one in the order given, one short clause each.
- Preserve object qualifiers exactly: an AirPods case is not an AirPod or proof of visible earbuds. Never shorten a case/container label to its contents. "Not visible" means unconfirmed in this photo, not nowhere to be found.
- Say plainly whether the item was found. If found, give where it is in the frame using the "where" field, and mention "next_to" if present.
- If status is "found" and there is no "where" field, the user has confirmed it is in the photo: say you take their word for it, and give no place.
- If status is "not_visible", say it is not in view and suggest checking another spot. If "last_seen" is present, say its stored location and time, clearly as a past sighting. If "history_status" is "unavailable", say history cannot currently be checked; do not say never seen. If only "last_seen_ago" is present, say how long ago it was last seen. If "never_seen_before" is true, say the camera has never seen it. Never state or guess a time or place that is not in the JSON.
- If status is "unsupported", say you cannot yet seek that item.
- If status is "no_target", ask what they are looking for.
- Always use the item's plain name (for example "phone", not a nickname). Never offer actions you cannot do, such as fetching or retrieving it.
- Wit and Victorian flourish are welcome, but the answer must be clear first. No emojis, no stage directions, no mention of JSON.`;

export function where(box: number[]): string {
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const vertical = cy < 0.33 ? "upper" : cy > 0.66 ? "lower" : "";
  const horizontal = cx < 0.33 ? "left" : cx > 0.66 ? "right" : "";
  return [vertical, horizontal].filter(Boolean).join(" ") || "center";
}

/** The closest other detected item, as "left of the wallet". Boxes that contain the item (a table) are skipped. */
export function near(target: Detection, detections: Detection[]): string | null {
  const c = (d: Detection) => [(d.box[0] + d.box[2]) / 2, (d.box[1] + d.box[3]) / 2];
  const [tx, ty] = c(target);
  const others = detections.filter(
    (d) => d.name !== target.name && !(d.box[0] <= tx && tx <= d.box[2] && d.box[1] <= ty && ty <= d.box[3]),
  );
  if (!others.length) return null;
  const dist = (d: Detection) => (c(d)[0] - tx) ** 2 + (c(d)[1] - ty) ** 2;
  const other = others.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  const dx = tx - c(other)[0];
  const dy = ty - c(other)[1];
  const side = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "left of" : "right of") : dy < 0 ? "above" : "below";
  return `${side} the ${other.name}`;
}

function entry(item: string, status: string, matches: Detection[], detections: Detection[]) {
  const out: Record<string, unknown> = { item, status };
  if (status === "not_visible") {
    const related = detections.filter((d) => d.name.toLowerCase() === `${item.toLowerCase()} case`);
    if (related.length) out.visible_related_objects = [...new Set(related.map((d) => d.name))];
  }
  if (matches[0]) {
    out.where = matches[0].location_description || where(matches[0].box);
    const rel = near(matches[0], detections);
    if (rel) out.next_to = rel;
    if (matches[0].conf != null) out.confidence_percent = Math.round(matches[0].conf * 100);
  }
  return out;
}

/** What the camera's detections say about the items asked for, when the processing server was not told which to look for. */
export function findings(targets: string[], base: Result): Result {
  const items: ItemResult[] = targets.map((item) => {
    const matches = base.detections.filter((d) => d.name === item).sort((a, b) => (b.conf ?? -1) - (a.conf ?? -1));
    return { item, status: matches.length ? "found" : "not_visible", matches };
  });
  const first = items.find((i) => i.matches.length) ?? items[0];
  return { ...base, status: first.matches.length ? "found" : "not_visible", target: first.item, matches: first.matches, items };
}

/** What Gemini is allowed to know. `lastSeen` is when a missing item was last in view, in words. */
export function factsFor(result: Result, lastSeen?: string | null) {
  const facts: Record<string, unknown> = { status: result.status, item: result.target };
  if (result.items && result.items.length > 1) {
    facts.items = result.items.map((i) => ({ ...entry(i.item, i.status, i.matches, result.detections), ...historyFacts(i.history_status, i.last_sighting) }));
  } else if (result.target) {
    Object.assign(facts, entry(result.target, result.status, result.matches, result.detections));
  }
  if (result.status === "no_target") facts.ask_for_item = true;
  if (result.history_status) Object.assign(facts, historyFacts(result.history_status, result.last_sighting));
  else if (lastSeen) facts.last_seen_ago = lastSeen;
  else if (result.status === "not_visible") facts.history_status = "unavailable";
  return facts;
}

function historyFacts(status?: HistoryStatus, sighting?: HistoryEvidence | null) {
  if (status === "available" && sighting) return { history_status: status,
    last_seen: { at: sighting.seen_at, location: sighting.location_description || sighting.zone || "the recorded position in the photo" } };
  if (status === "never_seen") return { history_status: status, never_seen_before: true };
  return status === "unavailable" ? { history_status: status } : {};
}

/** One call to Gemini. A request that has not answered after HEDGE_MS is not abandoned but joined by a second; the first answer wins. */
const HEDGE_MS = 1000;
const GEMINI_TIMEOUT_MS = 3000; // a slow Gemini must not hold the answer; wording falls back to plain

async function geminiOnce(body: object, key: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
  const data = await res.json();
  const parts: { text?: string }[] = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("").trim();
}

async function gemini(body: object, timeoutMs = GEMINI_TIMEOUT_MS): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const stop = new AbortController();
  const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(timeoutMs)]);
  const first = geminiOnce(body, key, signal);
  const second = new Promise<string>((resolve, reject) => setTimeout(() => geminiOnce(body, key, signal).then(resolve, reject), HEDGE_MS));
  try {
    return await Promise.any([first, second]);
  } catch (error) {
    throw (error as AggregateError).errors?.[0] ?? error;
  } finally {
    stop.abort(); // the slower request is no longer needed
  }
}

/** Plain wording for when Gemini is down or has no key, so a finished search still answers. */
export function plainReply(facts: Record<string, unknown>): string {
  if (Array.isArray(facts.items) && facts.items.length) {
    return facts.items.map((item) => plainReply(item as Record<string, unknown>)).join(" ");
  }
  const item = facts.item ?? "that";
  if (facts.status === "found") return `Your ${item} ${String(item).endsWith("s") ? "are" : "is"} ${facts.where}${facts.next_to ? `, ${facts.next_to}` : ""}.`;
  if (facts.status === "not_visible") {
    const related = facts.visible_related_objects as string[] | undefined;
    const lead = related?.length
      ? `I can see the ${related.join(" and the ")}, but cannot confirm ${item === "airpods" ? "the earbuds themselves are visible" : `your ${item} ${String(item).endsWith("s") ? "are" : "is"} visible`}.`
      : `I cannot see your ${item} now.`;
    const prior = facts.last_seen as {at: string; location: string} | undefined;
    if (prior) return `${lead} They were last seen ${prior.location} at ${prior.at}.`;
    if (facts.history_status === "unavailable") return `${lead.slice(0, -1)}, and history cannot currently be checked.`;
    if (facts.never_seen_before) return `${lead} The camera has not seen it before.`;
    return `${lead} Try checking another spot.`;
  }
  if (facts.status === "unsupported") return `I cannot yet seek the ${item}.`;
  return "What are you looking for?";
}

export async function narrate(facts: Record<string, unknown>): Promise<string> {
  // A visible case with unconfirmed contents needs explicit factual wording;
  // a paraphrase must not turn the reference object into a confirmed target.
  const entries = Array.isArray(facts.items) ? facts.items : [facts];
  if (entries.some((entry) => Array.isArray(entry.visible_related_objects) && entry.visible_related_objects.length)) {
    return plainReply(facts);
  }
  try {
    const text = await gemini({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(facts) }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 400 },
    });
    if (text) return text;
  } catch (error) {
    console.error("[narrator]", error);
  }
  return plainReply(facts);
}

const REMARK_PROMPT = `You are Sherlock Holmes, reborn as a witty steampunk inventor-detective, and you are the voice of Ctrl-F, a brass-and-gears device that finds lost belongings.

The device's camera has just taken a photograph for the user's search, and the photograph is now being examined. Make one witty remark about the photograph having been taken, while the user waits.

Rules:
- One sentence, at most 20 words, that sounds good read aloud.
- You have not seen the photograph. Never say or hint whether the item is in it, where it is, or what the photograph shows.
- You may mention the item they asked for by its plain name, if one is given.
- Wit and Victorian flourish are welcome. No emojis, no stage directions, no quotation marks.`;

const REMARK_MAX_CHARS = 200;
// The photo takes the desktop several seconds to examine, so a remark can wait longer than the answer's wording;
// one that is still not voiced when the answer is ready is dropped (s3-store.ts).
const REMARK_TIMEOUT_MS = 8000;

/**
 * The narrator's quip when the camera's photo is taken, worded by Gemini. Null when Gemini has no key,
 * fails or says nothing: the remark is only ever Gemini's, so there is no canned fallback.
 */
export async function remark(target: string | null, transcript: string): Promise<string | null> {
  try {
    const text = await gemini({
      systemInstruction: { parts: [{ text: REMARK_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ asked: transcript || null, item: target }) }] }],
      generationConfig: { temperature: 1.0, maxOutputTokens: 120 },
    }, REMARK_TIMEOUT_MS);
    return cleanRemark(text);
  } catch (error) {
    console.error("[remark]", error);
    return null;
  }
}

/** One line, no wrapping quotes, cut at a sentence end if Gemini runs long. Null when nothing is left. */
export function cleanRemark(text: string): string | null {
  let line = text.replace(/\s+/g, " ").trim().replace(/^["“”']+|["“”']+$/g, "").trim();
  if (line.length > REMARK_MAX_CHARS) {
    const cut = line.slice(0, REMARK_MAX_CHARS);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    line = end > 0 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
  }
  return line || null;
}

/** Known items named word for word in what was said; "phone" is dropped when "cell phone" is also there. */
export function namedItems(said: string, known: string[]): string[] {
  const text = ` ${said.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `; // words only, so "keys?" still matches
  const hits = known.filter((k) => text.includes(` ${k} `) || text.includes(` ${k}s `));
  return hits.filter((k) => !hits.some((other) => other !== k && other.includes(k)));
}

/** Arbitrary object phrases; the catalog is a naming hint, never an allowlist. */
export async function pickTargets(transcript: string, known: string[]): Promise<{ targets: string[]; unsupported: string | null }> {
  return { targets: extractTargets(transcript, known), unsupported: null };
}

function elevenKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

export async function transcribe(audio: Uint8Array, filename: string): Promise<string> {
  const form = new FormData();
  form.set("model_id", "scribe_v1");
  form.set("file", new Blob([audio as BlobPart]), filename);
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": elevenKey() },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs speech-to-text returned ${res.status}`);
  return ((await res.json()).text ?? "").trim();
}

type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

/** Per-character times to per-word times. */
export function wordTimes(a: Alignment): WordTime[] {
  const words: WordTime[] = [];
  let word = "";
  let start = 0;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (word) words.push({ word, start, end: a.character_end_times_seconds[i - 1] });
      word = "";
    } else {
      if (!word) start = a.character_start_times_seconds[i];
      word += ch;
    }
  });
  if (word) words.push({ word, start, end: a.character_end_times_seconds.at(-1) ?? start });
  return words;
}

export async function speak(text: string): Promise<{ audio: Buffer; timings: WordTime[] }> {
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": elevenKey(), "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs text-to-speech returned ${res.status}`);
  const data = await res.json();
  return { audio: Buffer.from(data.audio_base64, "base64"), timings: wordTimes(data.alignment) };
}
