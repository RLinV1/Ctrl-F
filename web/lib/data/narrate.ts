/** Ported from main's dev-test/find.py and dev-test/narrator.py: where() and near() word a box, Gemini words the reply, ElevenLabs does STT and TTS. */
import type { WordTime } from "./types";

export type Detection = { name: string; conf: number; box: [number, number, number, number] };
export type ItemResult = { item: string; status: "found" | "not_visible"; matches: Detection[] };
/** results/<id>_result.json, written by desktop/server.py. `unsupported` is added here for a request that names no known item. */
export type Result = {
  status: "found" | "not_visible" | "no_target" | "unsupported";
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
- Say plainly whether the item was found. If found, give where it is in the frame using the "where" field, and mention "next_to" if present.
- If status is "found" and there is no "where" field, the user has confirmed it is in the photo: say you take their word for it, and give no place.
- If status is "not_visible", say it is not in view and suggest checking another spot. If "last_seen_ago" is present, say how long ago it was last seen, and never say where. If "never_seen_before" is true, say the camera has never seen it. Never state or guess a time or place that is not in the JSON.
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
  if (matches[0]) {
    out.where = where(matches[0].box);
    const rel = near(matches[0], detections);
    if (rel) out.next_to = rel;
    out.confidence_percent = Math.round(matches[0].conf * 100);
  }
  return out;
}

/** What Gemini is allowed to know. `lastSeen` is when a missing item was last in view, in words. */
export function factsFor(result: Result, lastSeen?: string | null) {
  const facts: Record<string, unknown> = { status: result.status, item: result.target };
  if (result.items && result.items.length > 1) {
    facts.items = result.items.map((i) => entry(i.item, i.status, i.matches, result.detections));
  } else if (result.target) {
    Object.assign(facts, entry(result.target, result.status, result.matches, result.detections));
  }
  if (result.status === "no_target") facts.items_i_can_find = result.known ?? KNOWN_ITEMS;
  if (lastSeen) facts.last_seen_ago = lastSeen;
  else if (result.status === "not_visible") facts.never_seen_before = true;
  return facts;
}

async function gemini(body: object): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
  const data = await res.json();
  const parts: { text?: string }[] = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("").trim();
}

/** Plain wording for when Gemini is down or has no key, so a finished search still answers. */
function plainReply(facts: Record<string, unknown>): string {
  const item = facts.item ?? "that";
  if (facts.status === "found") return `Your ${item} is ${facts.where}${facts.next_to ? `, ${facts.next_to}` : ""}.`;
  if (facts.status === "not_visible") return `I cannot see your ${item} just now. Try checking another spot.`;
  if (facts.status === "unsupported") return `I cannot yet seek the ${item}.`;
  return "What are you looking for?";
}

export async function narrate(facts: Record<string, unknown>): Promise<string> {
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

/** Known items named word for word in what was said; "phone" is dropped when "cell phone" is also there. */
export function namedItems(said: string, known: string[]): string[] {
  const text = ` ${said.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `; // words only, so "keys?" still matches
  const hits = known.filter((k) => text.includes(` ${k} `) || text.includes(` ${k}s `));
  return hits.filter((k) => !hits.some((other) => other !== k && other.includes(k)));
}

/** Which known items did the user ask for? `unsupported` is an item they named that we cannot find. */
export async function pickTargets(transcript: string, known: string[]): Promise<{ targets: string[]; unsupported: string | null }> {
  const said = transcript.toLowerCase();
  if (!said.trim()) return { targets: [], unsupported: null };
  const direct = namedItems(said, known);
  if (direct.length) return { targets: direct, unsupported: null }; // saves a Gemini round trip when the item is named plainly
  try {
    const prompt =
      `Items we can find: ${JSON.stringify(known)}. The user said: ${JSON.stringify(transcript)}. ` +
      "Reply with JSON only: {\"targets\": [items from the list the user asked for, exactly as spelled there], " +
      "\"unsupported\": \"an item they asked for that is not in the list, else null\"}.";
    const text = await gemini({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: "application/json" },
    });
    const picked = JSON.parse(text);
    const targets: string[] = (picked.targets ?? []).filter((t: string) => known.includes(t));
    return { targets, unsupported: typeof picked.unsupported === "string" ? picked.unsupported : null };
  } catch (error) {
    console.error("[pickTargets]", error);
    return { targets: known.filter((k) => said.includes(k)), unsupported: null };
  }
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
