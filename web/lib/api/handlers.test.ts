import { describe, expect, it } from "vitest";
import { DONE_AFTER_MS, MockStore } from "../data/mock/store";
import { getItems, getJob, getLatestJob, getNextJob, getSightings, getStatus, postDeviceJob, postJob, postUpload } from "./handlers";

const post = (body: unknown) =>
  new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const withAuth = (token?: string) =>
  new Request("http://x/api/jobs/next", { headers: token ? { authorization: `Bearer ${token}` } : {} });

function setup() {
  const t = { now: 5_000_000 };
  return { t, store: new MockStore(() => t.now) };
}

describe("uploads and jobs", () => {
  it("issues an upload slot for audio types only", async () => {
    const { store } = setup();
    const ok = await postUpload(store, post({ contentType: "audio/webm;codecs=opus" }));
    expect(ok.status).toBe(201);
    const slot = await ok.json();
    expect(slot.audioKey).toMatch(/^audio\//);
    expect(Date.parse(slot.expiresAt) - 5_000_000).toBeLessThanOrEqual(10 * 60_000);
    expect((await postUpload(store, post({ contentType: "text/plain" }))).status).toBe(400);
  });

  it("creates a job only for stored audio", async () => {
    const { store } = setup();
    const slot = await (await postUpload(store, post({ contentType: "audio/webm" }))).json();
    const missing = await postJob(store, post({ audioKey: slot.audioKey }));
    expect(missing.status).toBe(400);
    store.storeAudio(slot.audioKey);
    const created = await postJob(store, post({ audioKey: slot.audioKey }));
    expect(created.status).toBe(201);
    expect((await created.json()).status).toBe("pending");
  });
});

describe("Pi claim", () => {
  it("rejects a missing or wrong token without a heartbeat", async () => {
    const { t, store } = setup();
    expect((await getNextJob(store, withAuth(), "secret")).status).toBe(401);
    expect((await getNextJob(store, withAuth("nope!!"), "secret")).status).toBe(401);
    expect((await getNextJob(store, withAuth("secret"), undefined)).status).toBe(401);
    t.now += 60_000; // past the simulated heartbeat
    const pi = (await store.deviceStatus()).find((d) => d.device === "pi")!;
    expect(Date.parse(pi.lastSeenAt!)).toBe(t.now - 2_000);
  });

  it("returns 204 when idle and records the poll", async () => {
    const { t, store } = setup();
    const res = await getNextJob(store, withAuth("secret"), "secret");
    expect(res.status).toBe(204);
    const pi = (await store.deviceStatus()).find((d) => d.device === "pi")!;
    expect(Date.parse(pi.lastSeenAt!)).toBe(t.now);
  });

  it("claims the oldest pending job", async () => {
    const { t, store } = setup();
    const first = await store.createJob({ audioKey: "audio/a.webm" }, "web");
    t.now += 5;
    await store.createJob({ audioKey: "audio/b.webm" }, "web");
    const res = await getNextJob(store, withAuth("secret"), "secret");
    expect(await res.json()).toEqual({ id: first.id });
  });
});

describe("job outcome", () => {
  it("reports found with a box, not found with the last sighting, and 404", async () => {
    const { t, store } = setup();
    const a = await store.createJob({ audioKey: "audio/a.webm" }, "web");
    const b = await store.createJob({ audioKey: "audio/b.webm" }, "web");
    t.now += DONE_AFTER_MS;
    const found = await (await getJob(store, a.id)).json();
    expect(found).toMatchObject({ status: "done", found: true });
    expect(found.match.box).toEqual(expect.objectContaining({ x: expect.any(Number), w: expect.any(Number) }));
    expect(found.replyAudioUrl).toBeTruthy();
    expect(found.replyTimings[0]).toEqual(expect.objectContaining({ word: expect.any(String), start: expect.any(Number) }));
    const missing = await (await getJob(store, b.id)).json();
    expect(missing).toMatchObject({ status: "done", found: false });
    expect(missing.lastSighting.label).toBe("keys");
    expect((await getJob(store, "nope")).status).toBe(404);
  });
});

describe("items and sightings", () => {
  it("lists items newest first", async () => {
    const { store } = setup();
    const items = await (await getItems(store)).json();
    expect(items[0].lastSeen).not.toBeNull();
    expect(items.at(-1).lastSeen).toBeNull();
  });

  it("pages, caps the limit, validates before, and 404s", async () => {
    const { store } = setup();
    const page = await (await getSightings(store, "item-wallet", new URL("http://x/?limit=2"))).json();
    expect(page).toHaveLength(2);
    const capped = await getSightings(store, "item-wallet", new URL("http://x/?limit=9999"));
    expect(capped.status).toBe(200);
    expect((await getSightings(store, "item-wallet", new URL("http://x/?before=soon"))).status).toBe(400);
    expect((await getSightings(store, "nope", new URL("http://x/"))).status).toBe(404);
  });
});

describe("status", () => {
  it("reports both devices", async () => {
    const { store } = setup();
    const status = await (await getStatus(store)).json();
    expect(status.map((d: { device: string }) => d.device)).toEqual(["pi", "desktop"]);
  });
});

describe("typed questions", () => {
  it("creates a job from text and answers for the item named", async () => {
    const { t, store } = setup();
    const res = await postJob(store, post({ text: "  where are my glasses?  " }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    t.now += DONE_AFTER_MS;
    const job = await (await getJob(store, id)).json();
    expect(job).toMatchObject({ status: "done", source: "web", transcript: "where are my glasses?", target: "glasses" });
    expect(job.replyText).toContain("glasses");
    expect(job.replyAudioUrl).toBeNull();
  });

  it("uses the recorded reply for an item that has one", async () => {
    const { t, store } = setup();
    const { id } = await (await postJob(store, post({ text: "have you seen my car keys" }))).json();
    t.now += DONE_AFTER_MS;
    const job = await (await getJob(store, id)).json();
    expect(job).toMatchObject({ target: "keys", found: false });
    expect(job.replyAudioUrl).toBeTruthy();
  });

  it("says so when no item is named", async () => {
    const { t, store } = setup();
    const { id } = await (await postJob(store, post({ text: "hello there" }))).json();
    t.now += DONE_AFTER_MS;
    const job = await (await getJob(store, id)).json();
    expect(job).toMatchObject({ target: null, found: false, match: null, lastSighting: null });
  });

  it("rejects empty and overlong text", async () => {
    const { store } = setup();
    expect((await postJob(store, post({ text: "   " }))).status).toBe(400);
    expect((await postJob(store, post({ text: "x".repeat(301) }))).status).toBe(400);
  });
});

describe("camera button", () => {
  const device = (body: BodyInit | null, headers: Record<string, string>) =>
    new Request("http://x/api/device/jobs", { method: "POST", body, headers });

  it("queues a device job from the Pi's recording and records the Pi as active", async () => {
    const { t, store } = setup();
    t.now += 60_000;
    const res = await postDeviceJob(store, device(new Uint8Array([1, 2, 3]), { authorization: "Bearer secret", "content-type": "audio/webm" }), "secret");
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect((await store.getJob(id))!.source).toBe("device");
    expect(await getNextJob(store, withAuth("secret"), "secret").then((r) => r.json())).toEqual({ id });
  });

  it("rejects a wrong token, a non-audio type and an empty body", async () => {
    const { store } = setup();
    const ok = { authorization: "Bearer secret", "content-type": "audio/webm" };
    expect((await postDeviceJob(store, device(new Uint8Array([1]), { ...ok, authorization: "Bearer nope" }), "secret")).status).toBe(401);
    expect((await postDeviceJob(store, device(new Uint8Array([1]), { ...ok, "content-type": "text/plain" }), "secret")).status).toBe(400);
    expect((await postDeviceJob(store, device(null, ok), "secret")).status).toBe(400);
  });

  it("finds the newest device job since a time, and nothing from before it", async () => {
    const { t, store } = setup();
    const since = new Date(t.now).toISOString();
    expect((await getLatestJob(store, new URL(`http://x/?source=device&since=${since}`))).status).toBe(204);
    t.now += 10;
    await store.createJob({ text: "where is my wallet" }, "web");
    const { id } = await store.createJob({ audioKey: "audio/d.webm" }, "device");
    const res = await getLatestJob(store, new URL(`http://x/?source=device&since=${since}`));
    expect(await res.json()).toEqual({ id });
    expect((await getLatestJob(store, new URL("http://x/?source=pi&since=x"))).status).toBe(400);
  });
});
