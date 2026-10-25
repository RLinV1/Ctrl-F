import { timingSafeEqual } from "node:crypto";
import { SIGHTINGS_DEFAULT_LIMIT, SIGHTINGS_MAX_LIMIT, type Store } from "../data/store";
import { audioExtension } from "../data/rules";

/** Route logic as plain functions of a Store, so tests can call them without Next. */

const json = (body: unknown, status = 200) => Response.json(body, { status });
const error = (message: string, status: number) => json({ error: message }, status);

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_QUESTION_CHARS = 300;

/** A recording as the request body, checked; or the error to answer with. */
async function readRecording(request: Request): Promise<{ audio: Uint8Array; contentType: string } | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    audioExtension(contentType);
  } catch {
    return error("content-type must be audio/webm, audio/mp4 or audio/ogg", 400);
  }
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) return error("empty recording", 400);
  if (audio.byteLength > MAX_AUDIO_BYTES) return error("recording too long", 413);
  return { audio, contentType };
}

async function queued(job: () => Promise<unknown>) {
  try {
    return json(await job(), 201);
  } catch (e) {
    console.error("[job]", e);
    return error("The request could not be queued.", 502);
  }
}

/**
 * A spoken question: the recording is the request body. It is transcribed and dropped: audio is never stored.
 * A typed question: a JSON body { text }, which is the transcript, so speech-to-text is skipped.
 */
export async function postJob(store: Store, request: Request) {
  if (request.headers.get("content-type")?.startsWith("application/json")) {
    let text: unknown;
    try {
      text = (await request.json())?.text;
    } catch {
      text = undefined;
    }
    if (typeof text !== "string" || !text.trim()) return error("text is required", 400);
    if (text.trim().length > MAX_QUESTION_CHARS) return error(`text is longer than ${MAX_QUESTION_CHARS} characters`, 400);
    return queued(() => store.askText(text.trim()));
  }
  const recording = await readRecording(request);
  if (recording instanceof Response) return recording;
  return queued(() => store.createJob(recording.audio, recording.contentType));
}

function tokenMatches(header: string | null, expected: string | undefined) {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * The camera's button: the Pi posts the recording from its own mic (raw audio body, audio/* content
 * type, Pi token), and it is queued like a spoken question from the page. The Ask page picks it up
 * through getLatestJob.
 */
export async function postDeviceJob(store: Store, request: Request, piToken: string | undefined) {
  if (!tokenMatches(request.headers.get("authorization"), piToken)) return error("unauthorized", 401);
  const recording = await readRecording(request);
  if (recording instanceof Response) return recording;
  return queued(() => store.createJob(recording.audio, recording.contentType, "device"));
}

/** The next unpresented job from a source, with a server timestamp/ID cursor. */
export async function getLatestJob(store: Store, url: URL) {
  const source = url.searchParams.get("source");
  const since = url.searchParams.get("since") ?? "";
  if (source !== "device" && source !== "web") return error("source must be device or web", 400);
  if (Number.isNaN(Date.parse(since))) return error("since must be an ISO time", 400);
  const id = await store.latestJobId(source, since, url.searchParams.get("afterId") ?? undefined);
  if (!id) return new Response(null, { status: 204 });
  const job = await store.getJob(id, false);
  return job ? json({ id, createdAt: job.createdAt }) : new Response(null, { status: 204 });
}

/** The spoken reply, kept in memory only. */
export async function getReplyAudio(store: Store, id: string) {
  const audio = await store.replyAudio(id);
  return audio ? new Response(new Uint8Array(audio), { headers: { "content-type": "audio/mpeg" } }) : error("no reply audio", 404);
}

export async function postCorrection(store: Store, id: string, request: Request) {
  let found: unknown;
  try {
    found = (await request.json())?.found;
  } catch {
    found = undefined;
  }
  if (typeof found !== "boolean") return error("found must be true or false", 400);
  const job = await store.correctJob(id, found);
  if (job === null) return error("job not found", 404);
  if (job === "conflict") return error("this job has no verdict to correct", 409);
  return json(job);
}

export async function getJob(store: Store, id: string) {
  const job = await store.getJob(id);
  return job ? json(job) : error("job not found", 404);
}

export async function getItems(store: Store) {
  return json(await store.listItems());
}

export async function getSightings(store: Store, id: string, url: URL) {
  const rawLimit = Number(url.searchParams.get("limit") ?? SIGHTINGS_DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.floor(rawLimit)), SIGHTINGS_MAX_LIMIT)
    : SIGHTINGS_DEFAULT_LIMIT;
  const before = url.searchParams.get("before") ?? undefined;
  if (before && Number.isNaN(Date.parse(before))) return error("before must be an ISO time", 400);
  const sightings = await store.itemSightings(id, { limit, before });
  return sightings ? json(sightings) : error("item not found", 404);
}

export async function getStatus(store: Store) {
  return json(await store.deviceStatus());
}
