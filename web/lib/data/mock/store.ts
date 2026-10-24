import { randomUUID } from "node:crypto";
import { SIGHTINGS_MAX_LIMIT, type Store } from "../store";
import type { Box, DeviceStatus, Item, JobSource, JobView, Sighting, Snapshot } from "../types";
import replies from "./replies.json";
import scenes from "./scenes.json";

/**
 * In-memory data for running the UI with no bucket, Pi or desktop (DATA_SOURCE=mock).
 * Sightings come from scenes.json (the same positions the mock snapshots are drawn
 * from). A new job is claimed after CLAIM_AFTER_MS and answered after DONE_AFTER_MS,
 * cycling through a found, a not-found and a never-seen answer.
 */

export const CLAIM_AFTER_MS = 1_500;
export const DONE_AFTER_MS = 4_500;
const STALE_PENDING_MS = 20_000;
const STALE_CLAIMED_MS = 60_000;

const LOST_COUNTS: Record<string, number> = {
  wallet: 3,
  keys: 5,
  glasses: 1,
  "airpods case": 2,
  remote: 0,
  watch: 0,
};
const ALIASES: Record<string, string[]> = { "airpods case": ["airpods", "earbuds case"], keys: ["car keys"] };

type Scenario = {
  transcript: string;
  target: string | null;
  /** Null when no item was named, so none was looked for. */
  found: boolean | null;
  /** A recorded reply with audio and word timings, when there is one. */
  reply: keyof typeof replies | null;
  /** The reply text when there is no recording. */
  replyText?: string;
};
const SCENARIOS: Scenario[] = [
  { transcript: "Where's my wallet?", target: "wallet", found: true, reply: "reply-wallet" },
  { transcript: "Have you seen my keys?", target: "keys", found: false, reply: "reply-keys" },
  { transcript: "Where did I leave my watch?", target: "watch", found: false, reply: "reply-watch" },
];

type MockJob = {
  id: string;
  source: JobSource;
  createdAt: number;
  claimedAt: number | null;
  scenario: Scenario;
  /** The user's verdict, when they corrected the camera's. */
  correction: boolean | null;
};

type State = {
  bootedAt: number;
  items: Map<string, { id: string; name: string; aliases: string[]; lostCount: number }>;
  sightings: Sighting[];
  jobs: Map<string, MockJob>;
  jobCount: number;
};

const W = scenes.width;
const H = scenes.height;

function snapshotRef(id: string): Snapshot {
  return { id, url: `/mock/${id}.svg`, width: W, height: H };
}

function boxFor(name: string, x: number, y: number): Box {
  const size = scenes.items[name as keyof typeof scenes.items];
  return { x: x / W, y: y / H, w: size.w / W, h: size.h / H };
}

function zoneFor(name: string, x: number, y: number): string | null {
  const size = scenes.items[name as keyof typeof scenes.items];
  const cx = x + size.w / 2;
  const cy = y + size.h / 2;
  for (const [zone, [zx, zy, zw, zh]] of Object.entries(scenes.zones)) {
    if (cx >= zx && cx <= zx + zw && cy >= zy && cy <= zy + zh) return zone;
  }
  return null;
}

/** Stable, believable confidence per item and snapshot (0.71 to 0.96). */
function confidenceFor(name: string, snapshotId: string): number {
  let h = 0;
  for (const c of name + snapshotId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Math.round((0.71 + (h % 26) / 100) * 100) / 100;
}

/** Earlier weeks repeat the same snapshots, so history has enough to page through. */
const REPEAT_WEEKS = 3;

function seed(now: number, empty: boolean): State {
  const items = new Map<string, { id: string; name: string; aliases: string[]; lostCount: number }>();
  for (const name of empty ? [] : Object.keys(scenes.items)) {
    const id = `item-${name.replace(/\s+/g, "-")}`;
    items.set(id, { id, name, aliases: ALIASES[name] ?? [], lostCount: LOST_COUNTS[name] ?? 0 });
  }
  const sightings: Sighting[] = [];
  for (let week = 0; week <= (empty ? -1 : REPEAT_WEEKS); week++) for (const snap of scenes.snapshots) {
    const seenAt = new Date(now - snap.minutesAgo * 60_000 - week * 7 * 24 * 60 * 60_000).toISOString();
    for (const [name, [x, y]] of Object.entries(snap.place)) {
      sightings.push({
        id: `${snap.id}-w${week}-${name.replace(/\s+/g, "-")}`,
        seenAt,
        label: name,
        confidence: confidenceFor(name, snap.id),
        box: boxFor(name, x, y),
        zone: zoneFor(name, x, y),
        snapshot: snapshotRef(snap.id),
      });
    }
  }
  sightings.sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt));
  return {
    bootedAt: now,
    items,
    sightings,
    jobs: new Map(),
    jobCount: 0,
  };
}

export class MockStore implements Store {
  private state: State;

  constructor(
    private clock: () => number = Date.now,
    opts: { empty?: boolean } = {},
  ) {
    this.state = seed(clock(), opts.empty ?? false);
  }

  private itemByName(name: string) {
    for (const item of this.state.items.values()) if (item.name === name) return item;
    return null;
  }

  private sightingsOf(name: string) {
    return this.state.sightings.filter((s) => s.label === name);
  }

  private toItem(id: string): Item | null {
    const item = this.state.items.get(id);
    if (!item) return null;
    return { id: item.id, name: item.name, lostCount: item.lostCount, lastSeen: this.sightingsOf(item.name)[0] ?? null };
  }

  /** Last seen first (ties keep the scene's order); never-seen items last, by name. */
  async listItems() {
    return [...this.state.items.keys()]
      .map((id) => this.toItem(id)!)
      .sort((a, b) => {
        if (a.lastSeen && b.lastSeen) return Date.parse(b.lastSeen.seenAt) - Date.parse(a.lastSeen.seenAt);
        if (a.lastSeen) return -1;
        if (b.lastSeen) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  async getItem(id: string) {
    return this.toItem(id);
  }

  async itemSightings(id: string, opts: { limit: number; before?: string }) {
    const item = this.state.items.get(id);
    if (!item) return null;
    const before = opts.before ? Date.parse(opts.before) : Infinity;
    return this.sightingsOf(item.name)
      .filter((s) => Date.parse(s.seenAt) < before)
      .slice(0, Math.min(opts.limit, SIGHTINGS_MAX_LIMIT));
  }

  /** Spoken questions cycle through the recorded scenarios (the recording itself is not listened to). */
  async createJob(_audio: Uint8Array, _contentType: string, source: JobSource = "web") {
    const scenario = SCENARIOS[this.state.jobCount % SCENARIOS.length];
    this.state.jobCount += 1;
    return this.queue(scenario, source);
  }

  /** Typed questions are answered for the item they name. */
  async askText(text: string) {
    return this.queue(this.scenarioForText(text), "web");
  }

  /** Mock only: a press of the camera's button, with a spoken question from its mic. */
  async simulatePress() {
    return this.createJob(new Uint8Array(), "audio/webm", "device");
  }

  private async queue(scenario: Scenario, source: JobSource) {
    const id = randomUUID();
    this.state.jobs.set(id, { id, source, createdAt: this.clock(), claimedAt: null, scenario, correction: null });
    return (await this.getJob(id))!;
  }

  async latestJobId(source: JobSource, since: string) {
    const after = Date.parse(since);
    const newest = [...this.state.jobs.values()]
      .filter((j) => j.source === source && j.createdAt > after)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return newest?.id ?? null;
  }

  /** Recorded replies have no audio served by this store: their files are in public/mock. */
  async replyAudio() {
    return null;
  }

  /** Finds the item a typed question names and answers from its sightings. */
  private scenarioForText(text: string): Scenario {
    const lower = text.toLowerCase();
    const names = [...this.state.items.values()]
      .flatMap((item) => [item.name, ...item.aliases].map((label) => ({ label, name: item.name })))
      .sort((a, b) => b.label.length - a.label.length);
    const hit = names.find(({ label }) => new RegExp(`\\b${label}\\b`).test(lower));
    if (!hit) {
      return {
        transcript: text,
        target: null,
        found: null,
        reply: null,
        replyText: "I could not tell which item you meant. Name it plainly, like “where are my keys?”.",
      };
    }
    const recorded = SCENARIOS.find((sc) => sc.target === hit.name);
    if (recorded) return { ...recorded, transcript: text };
    const newest = this.sightingsOf(hit.name)[0];
    const place = newest?.zone ? `the ${newest.zone}` : "a spot I cannot name";
    const found = Boolean(newest && this.clock() - Date.parse(newest.seenAt) < 60 * 60_000);
    // "glasses", "keys": plural nouns take plural verbs.
    const many = hit.name.endsWith("s");
    return {
      transcript: text,
      target: hit.name,
      found,
      reply: null,
      replyText: found
        ? `Your ${hit.name} ${many ? "rest" : "rests"} upon ${place}, plain as day.`
        : newest
          ? `Your ${hit.name} ${many ? "are" : "is"} not in view. I last saw ${many ? "them" : "it"} on ${place}.`
          : `I have never once seen your ${hit.name}. Place ${many ? "them" : "it"} within view, and I shall remember ${many ? "them" : "it"}.`,
    };
  }

  /** The simulated Pi claims the job after CLAIM_AFTER_MS. */
  private advance(job: MockJob, now: number) {
    if (job.claimedAt === null && now - job.createdAt >= CLAIM_AFTER_MS) {
      job.claimedAt = job.createdAt + CLAIM_AFTER_MS;
    }
  }

  async getJob(id: string): Promise<JobView | null> {
    const job = this.state.jobs.get(id);
    if (!job) return null;
    const now = this.clock();
    this.advance(job, now);
    const done = now - job.createdAt >= DONE_AFTER_MS;
    const status = done ? "done" : job.claimedAt !== null ? "claimed" : "pending";
    const base: JobView = {
      id,
      status,
      stale:
        status === "pending"
          ? now - job.createdAt > STALE_PENDING_MS
          : status === "claimed" && now - (job.claimedAt ?? now) > STALE_CLAIMED_MS,
      createdAt: new Date(job.createdAt).toISOString(),
      transcript: null,
      target: null,
      itemId: null,
      found: null,
      corrected: false,
      replyText: null,
      replyAudioUrl: null,
      replyPending: false,
      replyTimings: null,
      photo: null,
      match: null,
      lastSighting: null,
      error: null,
    };
    if (!done) return base;

    const { scenario, correction } = job;
    const corrected = correction !== null;
    const found = corrected ? correction : scenario.found;
    const item = scenario.target ? this.itemByName(scenario.target) : null;
    const reply = !corrected && scenario.reply ? replies[scenario.reply] : null;
    const finishedAt = new Date(job.createdAt + DONE_AFTER_MS).toISOString();
    const newest = scenario.target ? (this.sightingsOf(scenario.target)[0] ?? null) : null;
    // The camera's photo for this question: where the item was found, else the newest view of the room.
    const shot = scenario.found && newest ? newest.snapshot : snapshotRef(scenes.snapshots[0].id);
    const name = scenario.target ?? "item";
    return {
      ...base,
      transcript: scenario.transcript,
      target: scenario.target,
      itemId: item?.id ?? null,
      found,
      corrected,
      replyText: corrected
        ? found
          ? `I take your word for it: the ${name} is in the photo after all.`
          : `My apologies. The ${name} is not in view after all; try another spot.`
        : (reply?.text ?? scenario.replyText ?? null),
      replyAudioUrl: reply?.audio ?? null,
      replyTimings: reply?.timings ?? null,
      photo: { ...shot, seenAt: finishedAt },
      // A corrected "found" has no box to draw.
      match: found && !corrected && newest ? { ...newest, id: `${job.id}-match`, seenAt: finishedAt } : null,
      lastSighting: found === false ? newest : null,
    };
  }

  async correctJob(id: string, found: boolean) {
    const job = this.state.jobs.get(id);
    if (!job) return null;
    const view = await this.getJob(id);
    if (view?.status !== "done" || job.scenario.found === null) return "conflict" as const;
    job.correction = found;
    return this.getJob(id);
  }

  /** Newest first. */
  async listJobs(limit: number) {
    const jobs = [...this.state.jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    return (await Promise.all(jobs.map((j) => this.getJob(j.id)))).filter((j): j is JobView => j !== null);
  }

  /** Both simulated devices are always on. */
  async deviceStatus(): Promise<DeviceStatus[]> {
    const now = this.clock();
    return [
      { device: "pi", lastSeenAt: new Date(now - 2_000).toISOString(), online: true },
      { device: "desktop", lastSeenAt: new Date(now - 12_000).toISOString(), online: true },
    ];
  }
}
