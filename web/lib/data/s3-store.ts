import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { relativeTime } from "../format";
import { factsFor, KNOWN_ITEMS, narrate, pickTargets, type Detection, speak, transcribe, type Result } from "./narrate";
import { AUDIO_KEY, audioExtension } from "./rules";
import type { Store } from "./store";
import type { Box, DeviceStatus, Item, JobView, Sighting, WordTime } from "./types";

/*
 * Everything lives in one bucket, no database:
 *   audio/<id>.<ext>             the recording (browser, through PUT /api/uploads/audio)
 *   jobs/<id>.json               the job record
 *   queue/<id>                   marker: a job waiting for the Pi
 *   incoming/<id>.json + .jpg    the Pi's photo and the items asked for -> desktop/server.py
 *   results/<id>_result.json/jpg desktop/server.py's answer
 *   replies/<id>.mp3             the spoken reply
 *   memory.json                  items and sightings, for the Items and History screens
 *   heartbeat/desktop            touched by desktop/server.py every loop
 */

const SIGN_SECONDS = 3600;
const SLOT_MS = 10 * 60_000;
const STALE_PENDING_MS = 60_000;
const STALE_MS = 120_000;
const ONLINE_MS = { pi: 15_000, desktop: 60_000 } as const;
const MEMORY_CAP = 500;
const DEFAULT_SIZE = { width: 1280, height: 720 }; // what pi/capture.py shoots

type Stored = {
  id: string;
  seenAt: string;
  label: string;
  confidence: number;
  box: Box;
  snapshotKey: string;
  width: number;
  height: number;
};
type JobRec = {
  id: string;
  status: JobView["status"];
  audioKey: string;
  createdAt: string;
  transcript: string;
  targets: string[];
  unsupported: string | null;
  target?: string | null;
  found?: boolean;
  replyText?: string;
  replyKey?: string | null;
  replyTimings?: WordTime[] | null;
  match?: Stored | null;
  lastSighting?: Stored | null;
  error?: string | null;
};
type Memory = { items: Record<string, { lostCount: number }>; sightings: Stored[] };

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const toBox = (d: Detection): Box => ({ x: d.box[0], y: d.box[1], w: d.box[2] - d.box[0], h: d.box[3] - d.box[1] });

export class S3Store implements Store {
  private bucket = process.env.S3_BUCKET || "ctrlf-snapshots";
  private client: S3Client;
  private signer: S3Client;
  private lastPi: number | null = null;
  private finishing = new Map<string, Promise<JobRec>>();
  private memoryLock: Promise<unknown> = Promise.resolve();

  constructor() {
    const config = (endpoint?: string) => ({
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      region: process.env.S3_REGION || "us-east-1",
      credentials: process.env.S3_ACCESS_KEY_ID
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" }
        : undefined,
    });
    this.client = new S3Client(config(process.env.S3_ENDPOINT));
    // Signed URLs go to the browser, so they may need a different host than the server uses.
    this.signer = new S3Client(config(process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT));
  }

  private async getBytes(key: string): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return (await res.Body?.transformToByteArray()) ?? null;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private async getJson<T>(key: string): Promise<T | null> {
    const bytes = await this.getBytes(key);
    return bytes ? (JSON.parse(Buffer.from(bytes).toString("utf8")) as T) : null;
  }

  private put(key: string, body: Uint8Array | string, contentType?: string) {
    return this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  private putJson(key: string, value: unknown) {
    return this.put(key, JSON.stringify(value), "application/json");
  }

  private async head(key: string) {
    try {
      return await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private sign(key: string) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: SIGN_SECONDS });
  }

  /** Read-modify-write of memory.json, one at a time within this server. */
  private mutateMemory<T>(fn: (m: Memory) => T): Promise<T> {
    const run = async () => {
      const memory = (await this.getJson<Memory>("memory.json")) ?? { items: {}, sightings: [] };
      const out = fn(memory);
      await this.putJson("memory.json", memory);
      return out;
    };
    const next = this.memoryLock.then(run, run);
    this.memoryLock = next.catch(() => undefined);
    return next;
  }

  async createUploadSlot(contentType: string) {
    const audioKey = `audio/${randomUUID()}.${audioExtension(contentType)}`;
    return {
      audioKey,
      uploadUrl: `/api/uploads/audio?key=${encodeURIComponent(audioKey)}`,
      expiresAt: new Date(Date.now() + SLOT_MS).toISOString(),
    };
  }

  async storeAudio(key: string, body: ArrayBuffer, contentType: string) {
    if (!AUDIO_KEY.test(key)) throw new Error("bad key");
    await this.put(key, new Uint8Array(body), contentType);
  }

  async audioExists(key: string) {
    return AUDIO_KEY.test(key) && (await this.head(key)) !== null;
  }

  async createJob(audioKey: string): Promise<JobView> {
    const audio = await this.getBytes(audioKey);
    if (!audio) throw new Error("The recording went missing. Ask again.");
    let transcript = "";
    try {
      transcript = await transcribe(audio, audioKey.split("/")[1]);
    } catch (error) {
      console.error("[stt]", error); // no transcript: the narrator asks what they are looking for
    }
    const { targets, unsupported } = await pickTargets(transcript);
    const rec: JobRec = {
      id: randomUUID(),
      status: "pending",
      audioKey,
      createdAt: new Date().toISOString(),
      transcript,
      targets,
      unsupported,
    };
    await this.putJson(`jobs/${rec.id}.json`, rec);
    if (targets.length) await this.put(`queue/${rec.id}`, ""); // nothing to photograph otherwise; getJob answers it
    return this.view(rec);
  }

  async claimNextJob() {
    const list = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: "queue/" }));
    const oldest = (list.Contents ?? []).filter((o) => o.Key).sort((a, b) => +a.LastModified! - +b.LastModified!)[0];
    if (!oldest?.Key) return null;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: oldest.Key })); // at most once
    const id = oldest.Key.slice("queue/".length);
    const rec = await this.getJson<JobRec>(`jobs/${id}.json`);
    if (!rec || rec.status !== "pending") return null;
    await this.putJson(`jobs/${id}.json`, { ...rec, status: "claimed" });
    return { id, targets: rec.targets };
  }

  async touchDevice() {
    this.lastPi = Date.now();
  }

  async getJob(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    let rec = await this.getJson<JobRec>(`jobs/${id}.json`);
    if (!rec) return null;
    if (rec.status === "pending" || rec.status === "claimed") {
      // The jpg lands after the json, so the jpg means the desktop is done. No targets means no photo is coming.
      if (!rec.targets.length || (await this.head(`results/${id}_result.jpg`))) rec = await this.finish(rec);
    }
    return this.view(rec);
  }

  /** Narrate a job once, even if several polls arrive while it runs. */
  private finish(rec: JobRec): Promise<JobRec> {
    let running = this.finishing.get(rec.id);
    if (!running) {
      running = this.narrateJob(rec)
        .catch((error) => {
          console.error("[narrate]", error);
          return rec; // stays unanswered; the page times out as stale
        })
        .finally(() => this.finishing.delete(rec.id));
      this.finishing.set(rec.id, running);
    }
    return running;
  }

  private async narrateJob(rec: JobRec): Promise<JobRec> {
    const photo = `results/${rec.id}_result.jpg`;
    const result: Result = rec.targets.length
      ? ((await this.getJson<Result>(`results/${rec.id}_result.json`)) as Result)
      : { status: rec.unsupported ? "unsupported" : "no_target", target: rec.unsupported, matches: [], detections: [] };
    const width = result.width ?? DEFAULT_SIZE.width;
    const height = result.height ?? DEFAULT_SIZE.height;
    const now = new Date().toISOString();
    const stored = (d: Detection, label: string): Stored => ({
      id: `${rec.id}:${label}`,
      seenAt: now,
      label,
      confidence: d.conf,
      box: toBox(d),
      snapshotKey: photo,
      width,
      height,
    });

    const asked = (result.items ?? (result.target ? [{ item: result.target, status: result.status }] : [])).map((i) => i.item);
    const missing = (result.items ?? []).filter((i) => i.status === "not_visible").map((i) => i.item);
    if (!result.items && result.status === "not_visible" && result.target) missing.push(result.target);
    const best = new Map<string, Detection>();
    for (const d of result.detections) if (d.conf > (best.get(d.name)?.conf ?? 0)) best.set(d.name, d);

    // Memory: what was just seen, and a miss for each item asked for but not in view.
    const before = rec.targets.length
      ? await this.mutateMemory((m) => {
          const prior = m.sightings.find((s) => s.label === result.target);
          for (const name of asked) m.items[name] ??= { lostCount: 0 };
          for (const name of missing) m.items[name].lostCount += 1;
          m.sightings = [...[...best].map(([name, d]) => stored(d, name)), ...m.sightings].slice(0, MEMORY_CAP);
          return prior ?? null;
        })
      : null;

    const match = result.status === "found" && result.matches[0] ? stored(result.matches[0], result.target ?? result.matches[0].name) : null;
    const text = await narrate(factsFor(result, before ? relativeTime(before.seenAt, Date.now()) : null));
    let replyKey: string | null = null;
    let timings: WordTime[] | null = null;
    try {
      const spoken = await speak(text);
      replyKey = `replies/${rec.id}.mp3`;
      timings = spoken.timings;
      await this.put(replyKey, spoken.audio, "audio/mpeg");
    } catch (error) {
      console.error("[tts]", error); // the text still answers
      replyKey = null;
    }

    const done: JobRec = {
      ...rec,
      status: "done",
      target: result.target,
      found: result.status === "found",
      replyText: text,
      replyKey,
      replyTimings: timings,
      match,
      lastSighting: match ? null : before,
    };
    await this.putJson(`jobs/${rec.id}.json`, done);
    return done;
  }

  private async sighting(s: Stored): Promise<Sighting> {
    return {
      id: s.id,
      seenAt: s.seenAt,
      label: s.label,
      confidence: s.confidence,
      box: s.box,
      zone: null,
      snapshot: { id: s.snapshotKey, url: await this.sign(s.snapshotKey), width: s.width, height: s.height },
    };
  }

  private async view(rec: JobRec): Promise<JobView> {
    const age = Date.now() - Date.parse(rec.createdAt);
    const target = rec.target ?? rec.targets[0] ?? null;
    return {
      id: rec.id,
      status: rec.status,
      stale: rec.status !== "done" && age > (rec.status === "pending" ? STALE_PENDING_MS : STALE_MS),
      createdAt: rec.createdAt,
      transcript: rec.transcript,
      target,
      itemId: target ? slug(target) : null,
      found: rec.found ?? null,
      replyText: rec.replyText ?? null,
      replyAudioUrl: rec.replyKey ? await this.sign(rec.replyKey) : null,
      replyTimings: rec.replyTimings ?? null,
      match: rec.match ? await this.sighting(rec.match) : null,
      lastSighting: rec.lastSighting ? await this.sighting(rec.lastSighting) : null,
      error: rec.error ?? null,
    };
  }

  private async items(): Promise<{ item: Omit<Item, "lastSeen">; seen: Stored | null }[]> {
    const m = (await this.getJson<Memory>("memory.json")) ?? { items: {}, sightings: [] };
    const names = [...new Set([...KNOWN_ITEMS, ...Object.keys(m.items)])];
    return names.map((name) => ({
      item: { id: slug(name), name, lostCount: m.items[name]?.lostCount ?? 0 },
      seen: m.sightings.find((s) => s.label === name) ?? null,
    }));
  }

  async listItems() {
    const rows = await this.items();
    const items: Item[] = await Promise.all(
      rows.map(async ({ item, seen }) => ({ ...item, lastSeen: seen ? await this.sighting(seen) : null })),
    );
    return items.sort((a, b) => Date.parse(b.lastSeen?.seenAt ?? "") - Date.parse(a.lastSeen?.seenAt ?? "") || 0);
  }

  async getItem(id: string) {
    return (await this.listItems()).find((i) => i.id === id) ?? null;
  }

  async itemSightings(id: string, { limit, before }: { limit: number; before?: string }) {
    const row = (await this.items()).find((r) => r.item.id === id);
    if (!row) return null;
    const m = (await this.getJson<Memory>("memory.json")) ?? { items: {}, sightings: [] };
    const cutoff = before ? Date.parse(before) : Infinity;
    const page = m.sightings.filter((s) => s.label === row.item.name && Date.parse(s.seenAt) < cutoff).slice(0, limit);
    return Promise.all(page.map((s) => this.sighting(s)));
  }

  async deviceStatus(): Promise<DeviceStatus[]> {
    const desktop = (await this.head("heartbeat/desktop"))?.LastModified?.getTime() ?? null;
    const at = (device: "pi" | "desktop", t: number | null): DeviceStatus => ({
      device,
      lastSeenAt: t ? new Date(t).toISOString() : null,
      online: t !== null && Date.now() - t <= ONLINE_MS[device],
    });
    return [at("pi", this.lastPi), at("desktop", desktop)];
  }
}

function isMissing(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}
