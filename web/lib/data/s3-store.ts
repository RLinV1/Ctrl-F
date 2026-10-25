import { randomUUID } from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { relativeTime } from "../format";
import { factsFor, findings, KNOWN_ITEMS, namedItems, narrate, pickTargets, type Detection, speak, transcribe, type Result, where } from "./narrate";
import { audioExtension } from "./rules";
import type { Store } from "./store";
import type { Box, DeviceStatus, Item, JobSource, JobView, Sighting, WordTime } from "./types";

/*
 * One bucket, no database, and the web app's credentials are narrow: it may only write and delete
 * jobs/ and read incoming/ and results/ (see docs/ARCHITECTURE.md). So:
 *   jobs/<id>.json                web -> Pi:  {"text", "targets"}. The Pi polls jobs/, claims a job by deleting it.
 *   incoming/<id>.json + .jpg     the Pi's copy of the job and its photo; the processing server polls these
 *   results/<id>_result.json/jpg  the processing server's answer. The Items, History and Results screens are
 *                                 derived from these.
 *   results/heartbeat             optional: touched by the processing server, for the Desktop light
 * Job state (pending, claimed, the narration) is held in this server's memory. No audio is stored: the
 * recording is transcribed and dropped, and the spoken reply is held in memory too.
 */

const SIGN_SECONDS = 3600;
const REPLY_CACHE = 20; // spoken replies kept in memory
const JOB_CACHE = 200; // job records kept in memory
const RESULTS_READ = 60; // newest results read to build items and history
const RESULTS_TTL_MS = 3000;
const STALE_PENDING_MS = 60_000;
const STALE_MS = 120_000;
const DESKTOP_STALE_MS = 45_000; // a photo this old with no result means the processing server is broken
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
  source?: JobSource;
  status: JobView["status"];
  createdAt: string;
  transcript: string;
  targets: string[];
  unsupported: string | null;
  target?: string | null;
  found?: boolean | null;
  replyText?: string;
  replyTimings?: WordTime[] | null;
  claimedAt?: number;
  photo?: { key: string; seenAt: string; width: number; height: number } | null;
  /** The processing server's own result, kept so a correction can start from it. */
  result?: Result;
  corrected?: boolean;
  match?: Stored | null;
  lastSighting?: Stored | null;
  error?: string | null;
};
type StoredResult = { id: string; at: string; result: Result };

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const toBox = (d: Detection): Box => ({ x: d.box[0], y: d.box[1], w: d.box[2] - d.box[0], h: d.box[3] - d.box[1] });
const photoKey = (id: string) => `results/${id}_result.jpg`;
const resultKey = (id: string) => `results/${id}_result.json`;

export class S3Store implements Store {
  private bucket = process.env.S3_BUCKET || "ctrlf-snapshots";
  private client: S3Client;
  private signer: S3Client;
  private desktopDown = false; // set when a photo sat unprocessed, cleared when a result arrives
  private cameraDown = false; // set when a job was not picked up in time, cleared when the Pi next takes one
  private jobs = new Map<string, JobRec>();
  private finishing = new Map<string, Promise<JobRec>>();
  private replies = new Map<string, Buffer>();
  private speaking = new Set<string>();
  private picks = new Map<string, Promise<void>>(); // Gemini choosing the items, running while the Pi takes the photo
  private results: { at: number; rows: StoredResult[] } | null = null;
  private known: { at: number; list: string[] } | null = null;
  private parsed = new Map<string, Result>(); // result files never change once written, so each is downloaded once

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
    void this.knownItems(); // warm the caches so the first question is as fast as the rest
  }

  private async getJson<T>(key: string): Promise<T | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? (JSON.parse(Buffer.from(bytes).toString("utf8")) as T) : null;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  private sign(key: string) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: SIGN_SECONDS });
  }

  /** Objects under a prefix. Listing is what the credentials allow for results/ and incoming/; a missing key is not an error. */
  private async list(prefix: string, max = 5000) {
    const out: { key: string; at: Date; size: number }[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of page.Contents ?? []) if (o.Key && o.LastModified) out.push({ key: o.Key, at: o.LastModified, size: o.Size ?? 0 });
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token && out.length < max);
    return out;
  }

  /** The newest results, parsed. Cached for a few seconds because every page and poll asks. */
  private async recentResults(): Promise<StoredResult[]> {
    if (this.results && Date.now() - this.results.at < RESULTS_TTL_MS) return this.results.rows;
    const files = (await this.list("results/")).filter((f) => f.key.endsWith("_result.json"));
    const newest = files.sort((a, b) => +b.at - +a.at).slice(0, RESULTS_READ);
    const rows = (
      await Promise.all(
        newest.map(async (f) => {
          const id = f.key.slice("results/".length, -"_result.json".length);
          const cacheKey = `${f.key}@${+f.at}`;
          let result = this.parsed.get(cacheKey) ?? null;
          if (!result) {
            result = await this.getJson<Result>(f.key).catch(() => null);
            if (result) this.parsed.set(cacheKey, result);
          }
          return result ? { id, at: f.at.toISOString(), result } : null;
        }),
      )
    ).filter((r): r is StoredResult => r !== null);
    if (this.parsed.size > 300) this.parsed.clear();
    this.results = { at: Date.now(), rows };
    return rows;
  }

  /** The best sighting of each item in each result, newest result first. */
  private sightings(rows: StoredResult[]): Stored[] {
    return rows.flatMap(({ id, at, result }) => {
      const best = new Map<string, Detection>();
      for (const d of result.detections ?? []) if (d.conf > (best.get(d.name)?.conf ?? 0)) best.set(d.name, d);
      return [...best].map(([name, d]) => this.stored(id, at, result, d, name));
    });
  }

  private stored(id: string, at: string, result: Result, d: Detection, label: string): Stored {
    return {
      id: `${id}:${label}`,
      seenAt: at,
      label,
      confidence: d.conf,
      box: toBox(d),
      snapshotKey: photoKey(id),
      width: result.width ?? DEFAULT_SIZE.width,
      height: result.height ?? DEFAULT_SIZE.height,
    };
  }

  /** What the running model can find: the class list in the newest result that has one, else the trained classes. Cached for a minute. */
  private async knownItems(): Promise<string[]> {
    if (this.known && Date.now() - this.known.at < 60_000) return this.known.list;
    try {
      const withList = (await this.recentResults()).find((r) => r.result.known?.length);
      this.known = { at: Date.now(), list: withList?.result.known ?? KNOWN_ITEMS };
    } catch {
      return KNOWN_ITEMS;
    }
    return this.known.list;
  }

  async createJob(audio: Uint8Array, contentType: string, source: JobSource = "web"): Promise<JobView> {
    const t0 = Date.now();
    let transcript = "";
    try {
      transcript = await transcribe(audio, `recording.${audioExtension(contentType)}`);
    } catch (error) {
      console.error("[stt]", error); // no transcript: the narrator asks what they are looking for
    }
    console.log(`[timing] speech-to-text ${Date.now() - t0} ms`);
    return this.queue(transcript, source);
  }

  /** A typed question needs no speech-to-text: the text is the transcript. */
  async askText(text: string): Promise<JobView> {
    return this.queue(text.trim(), "web");
  }

  async latestJobId(source: JobSource, since: string) {
    const after = Date.parse(since);
    const newest = [...this.jobs.values()]
      .filter((j) => (j.source ?? "web") === source && Date.parse(j.createdAt) > after)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    return newest?.id ?? null;
  }

  private async queue(transcript: string, source: JobSource): Promise<JobView> {
    const tStt = Date.now();
    const known = await this.knownItems();
    // Items named plainly go to the Pi at once. Otherwise the job goes with no items and Gemini picks them while the photo is
    // taken; the detections in the result are enough to say whether each one is in view.
    const targets = namedItems(transcript, known);
    const rec: JobRec = {
      id: randomUUID(),
      source,
      status: "pending",
      createdAt: new Date().toISOString(),
      transcript,
      targets,
      unsupported: null,
    };
    console.log(`[job] ${rec.id} said ${JSON.stringify(transcript)} -> targets ${JSON.stringify(targets)}, writing jobs/`);
    this.jobs.set(rec.id, rec);
    if (!targets.length && transcript.trim()) {
      this.picks.set(
        rec.id,
        pickTargets(transcript, known)
          .then((picked) => {
            const cur = this.jobs.get(rec.id);
            if (cur) this.jobs.set(rec.id, { ...cur, targets: picked.targets, unsupported: picked.unsupported });
          })
          .catch((error) => console.error("[pick]", error)),
      );
    }
    // Every request goes to the bucket for the Pi to poll, even one that names no item: the photo still comes back.
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `jobs/${rec.id}.json`,
        Body: JSON.stringify({ text: transcript, targets }),
        ContentType: "application/json",
      }),
    );
    console.log(`[timing] ${rec.id.slice(0, 8)} send: writing job ${Date.now() - tStt} ms`);
    for (const old of [...this.jobs.keys()].slice(0, -JOB_CACHE)) this.jobs.delete(old);
    return this.view(rec);
  }

  async replyAudio(id: string) {
    return this.replies.get(id) ?? null;
  }

  async getJob(id: string) {
    let rec = this.jobs.get(id);
    if (!rec) return null;
    if (rec.status === "pending" || rec.status === "claimed") {
      // The jpg lands after the json, so both present means the processing server is done.
      if (await this.hasResult(id)) rec = await this.finish(rec);
      else if (rec.status === "pending" && (await this.list(`incoming/${id}.`, 5)).length) rec = this.update(rec, { status: "claimed", claimedAt: Date.now() });
      // Devices count as online until a job shows otherwise.
      if (rec.status === "pending" && Date.now() - Date.parse(rec.createdAt) > STALE_PENDING_MS) this.cameraDown = true;
      if (rec.status === "claimed" && Date.now() - (rec.claimedAt ?? Date.now()) > DESKTOP_STALE_MS) this.desktopDown = true;
    }
    if (rec.status === "claimed" || rec.status === "done") this.cameraDown = false;
    if (rec.status === "done" && rec.result) this.desktopDown = false;
    return this.view(rec);
  }

  private update(rec: JobRec, change: Partial<JobRec>): JobRec {
    const next = { ...rec, ...change };
    this.jobs.set(rec.id, next);
    return next;
  }

  async correctJob(id: string, found: boolean) {
    const rec = this.jobs.get(id);
    if (!rec) return null;
    const verdict = rec.result?.status;
    if (rec.status !== "done" || (verdict !== "found" && verdict !== "not_visible")) return "conflict" as const;
    return this.view(await this.finish(rec, found));
  }

  private async hasResult(id: string) {
    const keys = new Set((await this.list(`results/${id}_result.`)).map((o) => o.key));
    return keys.has(resultKey(id)) && keys.has(photoKey(id));
  }

  /** Narrate a job once, even if several polls arrive while it runs. */
  private finish(rec: JobRec, correction?: boolean): Promise<JobRec> {
    let running = this.finishing.get(rec.id);
    if (!running) {
      running = this.narrateJob(rec, correction)
        .catch((error) => {
          console.error("[narrate]", error);
          return rec; // stays unanswered; the page times out as stale
        })
        .finally(() => this.finishing.delete(rec.id));
      this.finishing.set(rec.id, running);
    }
    return running;
  }

  private async narrateJob(start: JobRec, correction?: boolean): Promise<JobRec> {
    // Wait for Gemini's choice of items if it has not finished (it has had the photo's whole trip), but not for long.
    await Promise.race([this.picks.get(start.id), new Promise((resolve) => setTimeout(resolve, 6000))]);
    this.picks.delete(start.id);
    const rec = this.jobs.get(start.id) ?? start;
    const raw = rec.result ?? ((await this.getJson<Result>(resultKey(rec.id))) as Result);
    // The processing server was not told which items to look for: say from its detections.
    const detected = raw.status === "no_target" && rec.targets.length ? findings(rec.targets, raw) : raw;
    let result = detected;
    // The processing server only knows the classes it was trained on; an item we cannot seek arrives as "no_target".
    if (result.status === "no_target" && rec.unsupported) result = { ...result, status: "unsupported", target: rec.unsupported };
    // The user's verdict beats the detector's. "Found" with no match has no box to draw and no place to name.
    if (correction !== undefined) {
      result = { ...result, status: correction ? "found" : "not_visible", matches: [], items: undefined };
    }
    const now = new Date().toISOString();

    // Last seen: the newest earlier result with this item in it.
    this.results = null;
    const earlier = result.target
      ? this.sightings((await this.recentResults()).filter((r) => r.id !== rec.id)).find((s) => s.label === result.target)
      : undefined;

    const match =
      result.status === "found" && result.matches[0]
        ? this.stored(rec.id, now, result, result.matches[0], result.target ?? result.matches[0].name)
        : null;
    this.replies.delete(rec.id); // a correction replaces the earlier spoken reply
    const tNarrate = Date.now();
    const text = await narrate(factsFor(result, earlier ? relativeTime(earlier.seenAt, Date.now()) : null));
    const tText = Date.now();

    const done: JobRec = {
      ...rec,
      status: "done",
      result: detected,
      corrected: correction !== undefined,
      target: result.target,
      found: result.status === "found" ? true : result.status === "not_visible" ? false : null, // null: no item was searched for
      replyText: text,
      replyTimings: null, // arrive with the audio
      photo: { key: photoKey(rec.id), seenAt: now, width: result.width ?? DEFAULT_SIZE.width, height: result.height ?? DEFAULT_SIZE.height },
      match,
      lastSighting: result.status === "not_visible" ? (earlier ?? null) : null,
    };
    this.jobs.set(rec.id, done);
    this.startSpeech(rec.id, text);
    void this.logTiming(rec, tNarrate, tText);
    return done;
  }

  /** The answer is shown as soon as the text is ready; the speech (audio and word times) follows in the background. */
  private startSpeech(id: string, text: string) {
    this.speaking.add(id);
    speak(text)
      .then((spoken) => {
        this.replies.set(id, spoken.audio);
        for (const old of [...this.replies.keys()].slice(0, -REPLY_CACHE)) this.replies.delete(old);
        const rec = this.jobs.get(id);
        if (rec) this.jobs.set(id, { ...rec, replyTimings: spoken.timings });
      })
      .catch((error) => console.error("[tts]", error)) // the text still answers
      .finally(() => this.speaking.delete(id));
  }

  private async logTiming(rec: JobRec, tNarrate: number, tText: number) {
    try {
      const made = Date.parse(rec.createdAt);
      const at = async (prefix: string) => (await this.list(prefix, 5)).map((o) => +o.at - made)[0] ?? "?";
      console.log(`[timing] ${rec.id.slice(0, 8)} done: Pi photo +${await at(`incoming/${rec.id}.jpg`)} ms, result +${await at(photoKey(rec.id))} ms after the job; wording ${tText - tNarrate} ms`);
    } catch {
      // timing is only a log
    }
  }

  private async sighting(s: Stored): Promise<Sighting> {
    return {
      id: s.id,
      seenAt: s.seenAt,
      label: s.label,
      confidence: s.confidence,
      box: s.box,
      zone: `${where([s.box.x, s.box.y, s.box.x + s.box.w, s.box.y + s.box.h])} of the frame`, // no named places yet: say where in the photo
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
      corrected: rec.corrected ?? false,
      replyText: rec.replyText ?? null,
      replyAudioUrl: this.replies.has(rec.id) ? `/api/jobs/${rec.id}/audio` : null,
      replyPending: this.speaking.has(rec.id),
      replyTimings: rec.replyTimings ?? null,
      photo: rec.photo ? { id: rec.photo.key, url: await this.sign(rec.photo.key), width: rec.photo.width, height: rec.photo.height, seenAt: rec.photo.seenAt } : null,
      match: rec.match ? await this.sighting(rec.match) : null,
      lastSighting: rec.lastSighting ? await this.sighting(rec.lastSighting) : null,
      error: rec.error ?? null,
    };
  }

  /** This session's questions, then older results from the bucket (those have no question or reply text). */
  async listJobs(limit: number) {
    const mine = [...this.jobs.values()];
    const known = new Set(mine.map((j) => j.id));
    const older: JobRec[] = (await this.recentResults())
      .filter((r) => !known.has(r.id))
      .map(({ id, at, result }) => {
        const first = result.matches[0];
        return {
          id,
          status: "done",
          createdAt: at,
          transcript: "",
          targets: [],
          unsupported: null,
          target: result.target,
          found: result.status === "found",
          photo: { key: photoKey(id), seenAt: at, width: result.width ?? DEFAULT_SIZE.width, height: result.height ?? DEFAULT_SIZE.height },
          match: result.status === "found" && first ? this.stored(id, at, result, first, result.target ?? first.name) : null,
        };
      });
    const all = [...mine, ...older].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
    return Promise.all(all.map((r) => this.view(r)));
  }

  private async items(): Promise<{ item: Omit<Item, "lastSeen">; seen: Stored | null }[]> {
    const rows = await this.recentResults();
    const lost: Record<string, number> = {};
    for (const { result } of rows) {
      const asked = result.items ?? (result.target ? [{ item: result.target, status: result.status }] : []);
      for (const i of asked) if (i.status === "not_visible") lost[i.item] = (lost[i.item] ?? 0) + 1;
    }
    const seen = this.sightings(rows);
    const names = [...new Set([...KNOWN_ITEMS, ...Object.keys(lost), ...seen.map((s) => s.label)])];
    return names.map((name) => ({
      item: { id: slug(name), name, lostCount: lost[name] ?? 0 },
      seen: seen.find((s) => s.label === name) ?? null,
    }));
  }

  async listItems() {
    const rows = await this.items();
    const items: Item[] = await Promise.all(rows.map(async ({ item, seen }) => ({ ...item, lastSeen: seen ? await this.sighting(seen) : null })));
    return items.sort((a, b) => Date.parse(b.lastSeen?.seenAt ?? "") - Date.parse(a.lastSeen?.seenAt ?? "") || 0);
  }

  async getItem(id: string) {
    return (await this.listItems()).find((i) => i.id === id) ?? null;
  }

  async itemSightings(id: string, { limit, before }: { limit: number; before?: string }) {
    const row = (await this.items()).find((r) => r.item.id === id);
    if (!row) return null;
    const cutoff = before ? Date.parse(before) : Infinity;
    const page = this.sightings(await this.recentResults())
      .filter((s) => s.label === row.item.name && Date.parse(s.seenAt) < cutoff)
      .slice(0, limit);
    return Promise.all(page.map((s) => this.sighting(s)));
  }

  /** Neither device talks to this server. The camera counts as online until a job goes unclaimed, and the desktop likewise, until a photo goes unprocessed. */
  async deviceStatus(): Promise<DeviceStatus[]> {
    const shot = Math.max(0, ...(await this.list("incoming/", 5000)).map((o) => +o.at)) || null;
    const beat = (await this.list("results/heartbeat", 10)).map((o) => +o.at);
    const done = (await this.recentResults())[0];
    const desktop = Math.max(0, ...beat, done ? Date.parse(done.at) : 0) || null;
    const seen = (t: number | null) => (t ? new Date(t).toISOString() : null);
    return [
      { device: "pi", lastSeenAt: seen(shot), online: !this.cameraDown },
      { device: "desktop", lastSeenAt: seen(desktop), online: !this.desktopDown },
    ];
  }
}

function isMissing(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}
