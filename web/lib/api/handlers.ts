import { SIGHTINGS_DEFAULT_LIMIT, SIGHTINGS_MAX_LIMIT, type Store } from "../data/store";
import { audioExtension } from "../data/rules";
import { zip } from "../zip";

/** Route logic as plain functions of a Store, so tests can call them without Next. */

const json = (body: unknown, status = 200) => Response.json(body, { status });
const error = (message: string, status: number) => json({ error: message }, status);

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** The recording is the request body. It is transcribed and dropped: audio is never stored. */
export async function postJob(store: Store, request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    audioExtension(contentType);
  } catch {
    return error("content-type must be audio/webm, audio/mp4 or audio/ogg", 400);
  }
  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) return error("empty recording", 400);
  if (audio.byteLength > MAX_AUDIO_BYTES) return error("recording too long", 413);
  try {
    return json(await store.createJob(audio, contentType), 201);
  } catch (e) {
    console.error("[job]", e);
    return error("The request could not be queued.", 502);
  }
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

/** A raw photo from incoming/. `?download=1` makes the browser save it instead of showing it. */
export async function getPhoto(store: Store, id: string, url: URL) {
  const bytes = await store.getPhoto(id);
  if (!bytes) return error("photo not found", 404);
  const headers: Record<string, string> = { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" };
  if (url.searchParams.get("download")) headers["content-disposition"] = `attachment; filename="${id}.jpg"`;
  return new Response(new Uint8Array(bytes), { headers });
}

const ZIP_MAX_PHOTOS = 200;

/** Every raw photo in incoming/ as one zip. */
export async function getPhotoZip(store: Store) {
  const photos = (await store.listPhotos()).slice(0, ZIP_MAX_PHOTOS);
  if (photos.length === 0) return error("no photos to download", 404);
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < photos.length; i += 8) {
    const batch = await Promise.all(photos.slice(i, i + 8).map(async (p) => ({ name: `${p.id}.jpg`, data: await store.getPhoto(p.id) })));
    for (const f of batch) if (f.data) files.push({ name: f.name, data: f.data });
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(zip(files)), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="ctrlf-photos-${day}.zip"` },
  });
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
