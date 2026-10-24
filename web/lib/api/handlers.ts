import { timingSafeEqual } from "node:crypto";
import { SIGHTINGS_DEFAULT_LIMIT, SIGHTINGS_MAX_LIMIT, type Store } from "../data/store";
import { audioExtension, audioKeyFor } from "../data/rules";

export const MAX_QUESTION_CHARS = 300;
export const MAX_DEVICE_AUDIO_BYTES = 10 * 1024 * 1024;

/** Route logic as plain functions of a Store, so tests can call them without Next. */

const json = (body: unknown, status = 200) => Response.json(body, { status });
const error = (message: string, status: number) => json({ error: message }, status);

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function postUpload(store: Store, request: Request) {
  const body = await readJson(request);
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  try {
    audioExtension(contentType);
  } catch {
    return error("contentType must be audio/webm, audio/mp4 or audio/ogg", 400);
  }
  return json(await store.createUploadSlot(contentType), 201);
}

/** A spoken question ({ audioKey } of stored audio) or a typed one ({ text }). */
export async function postJob(store: Store, request: Request) {
  const body = await readJson(request);
  if (typeof body?.text === "string") {
    const text = body.text.trim();
    if (!text) return error("text is empty", 400);
    if (text.length > MAX_QUESTION_CHARS) return error(`text is longer than ${MAX_QUESTION_CHARS} characters`, 400);
    return json(await store.createJob({ text }, "web"), 201);
  }
  const audioKey = typeof body?.audioKey === "string" ? body.audioKey : "";
  if (!audioKey.startsWith("audio/")) return error("audioKey is required", 400);
  if (!(await store.audioExists(audioKey))) return error("no audio stored at audioKey", 400);
  return json(await store.createJob({ audioKey }, "web"), 201);
}

function tokenMatches(header: string | null, expected: string | undefined) {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function getNextJob(store: Store, request: Request, piToken: string | undefined) {
  if (!tokenMatches(request.headers.get("authorization"), piToken)) return error("unauthorized", 401);
  await store.touchDevice("pi");
  const id = await store.claimNextJob();
  return id ? json({ id }) : new Response(null, { status: 204 });
}

/**
 * The camera's button: the Pi posts the recording from its own mic (raw audio body,
 * audio/* content type, Pi token). The audio is stored and a job is queued; the Pi
 * then claims it from /api/jobs/next like any other.
 */
export async function postDeviceJob(store: Store, request: Request, piToken: string | undefined) {
  if (!tokenMatches(request.headers.get("authorization"), piToken)) return error("unauthorized", 401);
  const contentType = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
  try {
    audioExtension(contentType);
  } catch {
    return error("content-type must be audio/webm, audio/mp4 or audio/ogg", 400);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return error("empty recording", 400);
  if (bytes.byteLength > MAX_DEVICE_AUDIO_BYTES) return error("recording is too large", 413);
  await store.touchDevice("pi");
  const audioKey = audioKeyFor(contentType, new Date(), crypto.randomUUID());
  await store.putAudio(audioKey, bytes, contentType);
  return json(await store.createJob({ audioKey }, "device"), 201);
}

/** The newest job from a source since a time, so the page can pick up camera-button questions. */
export async function getLatestJob(store: Store, url: URL) {
  const source = url.searchParams.get("source");
  const since = url.searchParams.get("since") ?? "";
  if (source !== "device" && source !== "web") return error("source must be device or web", 400);
  if (Number.isNaN(Date.parse(since))) return error("since must be an ISO time", 400);
  const id = await store.latestJobId(source, since);
  return id ? json({ id }) : new Response(null, { status: 204 });
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
