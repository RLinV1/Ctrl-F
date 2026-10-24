import { timingSafeEqual } from "node:crypto";
import { SIGHTINGS_DEFAULT_LIMIT, SIGHTINGS_MAX_LIMIT, type Store } from "../data/store";
import { audioExtension } from "../data/rules";

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

/** The upload slot's PUT target: the recording goes through the server, so the bucket needs no CORS rules. */
export async function putAudio(store: Store, request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return error("empty upload", 400);
  try {
    await store.storeAudio(key, body, request.headers.get("content-type") ?? "audio/webm");
  } catch (e) {
    if ((e as Error).message === "bad key") return error("bad key", 400);
    console.error("[upload]", e);
    return error("The recording could not be stored.", 502);
  }
  return new Response(null, { status: 200 });
}

export async function postJob(store: Store, request: Request) {
  const body = await readJson(request);
  const audioKey = typeof body?.audioKey === "string" ? body.audioKey : "";
  if (!audioKey.startsWith("audio/")) return error("audioKey is required", 400);
  if (!(await store.audioExists(audioKey))) return error("no audio stored at audioKey", 400);
  try {
    return json(await store.createJob(audioKey), 201);
  } catch (e) {
    return error((e as Error).message, 502);
  }
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
  const claim = await store.claimNextJob();
  return claim ? json(claim) : new Response(null, { status: 204 });
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
