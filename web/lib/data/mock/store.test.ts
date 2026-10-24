import { describe, expect, it } from "vitest";
import { CLAIM_AFTER_MS, DONE_AFTER_MS, MockStore } from "./store";

function clockAt(start: number) {
  const t = { now: start };
  return { t, clock: () => t.now };
}

describe("MockStore items", () => {
  it("orders items by last seen, never-seen last", async () => {
    const store = new MockStore();
    const items = await store.listItems();
    expect(items.length).toBeGreaterThanOrEqual(4);
    const seen = items.filter((i) => i.lastSeen);
    const times = seen.map((i) => Date.parse(i.lastSeen!.seenAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const watch = items.at(-1)!;
    expect(watch.name).toBe("watch");
    expect(watch.lastSeen).toBeNull();
    expect(watch.lostCount).toBe(0);
  });

  it("pages sightings newest first with before", async () => {
    const store = new MockStore();
    const first = (await store.itemSightings("item-wallet", { limit: 2 }))!;
    expect(first).toHaveLength(2);
    const next = (await store.itemSightings("item-wallet", { limit: 2, before: first[1].seenAt }))!;
    expect(Date.parse(next[0].seenAt)).toBeLessThan(Date.parse(first[1].seenAt));
    expect(await store.itemSightings("nope", { limit: 2 })).toBeNull();
  });

  it("gives every sighting a box inside the image", async () => {
    const store = new MockStore();
    for (const item of await store.listItems()) {
      for (const s of (await store.itemSightings(item.id, { limit: 200 }))!) {
        expect(s.box.x + s.box.w).toBeLessThanOrEqual(1);
        expect(s.box.y + s.box.h).toBeLessThanOrEqual(1);
      }
    }
  });
});

const audio = new Uint8Array([1, 2, 3]);

describe("MockStore jobs", () => {
  it("moves pending to claimed to done", async () => {
    const { t, clock } = clockAt(1_000_000);
    const store = new MockStore(clock);
    const { id } = await store.createJob(audio, "audio/webm");

    expect((await store.getJob(id))!.status).toBe("pending");
    t.now += CLAIM_AFTER_MS;
    expect((await store.getJob(id))!.status).toBe("claimed");
    t.now += DONE_AFTER_MS;
    const done = (await store.getJob(id))!;
    expect(done.status).toBe("done");
    expect(done.found).toBe(true);
    expect(done.match?.box).toBeDefined();
    expect(done.photo?.url).toBe(done.match?.snapshot.url);
    expect(done.replyTimings?.length).toBeGreaterThan(0);
  });

  it("cycles to a not-found answer with the last sighting and a fresh photo", async () => {
    const { t, clock } = clockAt(1_000_000);
    const store = new MockStore(clock);
    await store.createJob(audio, "audio/webm");
    const { id } = await store.createJob(audio, "audio/webm");
    t.now += DONE_AFTER_MS;
    const job = (await store.getJob(id))!;
    expect(job.found).toBe(false);
    expect(job.target).toBe("keys");
    expect(job.lastSighting?.label).toBe("keys");
    expect(job.photo).not.toBeNull();
  });

  it("answers a typed question for the item it names", async () => {
    const { t, clock } = clockAt(1_000_000);
    const store = new MockStore(clock);
    const { id } = await store.askText("where did my glasses go");
    t.now += DONE_AFTER_MS;
    const job = (await store.getJob(id))!;
    expect(job.transcript).toBe("where did my glasses go");
    expect(job.target).toBe("glasses");
  });

  it("looks for nothing when no item is named", async () => {
    const { t, clock } = clockAt(1_000_000);
    const store = new MockStore(clock);
    const { id } = await store.askText("hello there");
    t.now += DONE_AFTER_MS;
    const job = (await store.getJob(id))!;
    expect(job.found).toBeNull();
    expect(await store.correctJob(id, true)).toBe("conflict");
  });

  it("re-words the answer when the user corrects it", async () => {
    const { t, clock } = clockAt(1_000_000);
    const store = new MockStore(clock);
    const { id } = await store.createJob(audio, "audio/webm");
    expect(await store.correctJob(id, false)).toBe("conflict"); // not answered yet
    t.now += DONE_AFTER_MS;
    const job = (await store.correctJob(id, false)) as Awaited<ReturnType<MockStore["getJob"]>>;
    expect(job?.found).toBe(false);
    expect(job?.corrected).toBe(true);
    expect(job?.replyText).toMatch(/not in view/);
    expect(await store.correctJob("nope", true)).toBeNull();
  });

  it("finds the newest camera-button job since a time", async () => {
    const { t, clock } = clockAt(1_000_000);
    const store = new MockStore(clock);
    const since = new Date(t.now).toISOString();
    await store.createJob(audio, "audio/webm");
    expect(await store.latestJobId("device", since)).toBeNull();
    t.now += 10;
    const press = await store.simulatePress();
    expect(await store.latestJobId("device", since)).toBe(press.id);
    expect((await store.listJobs(10)).map((j) => j.id)[0]).toBe(press.id);
  });
});

describe("MockStore options", () => {
  it("starts empty when asked", async () => {
    const store = new MockStore(Date.now, { empty: true });
    expect(await store.listItems()).toEqual([]);
  });

  it("has more than a page of wallet history", async () => {
    const store = new MockStore();
    expect((await store.itemSightings("item-wallet", { limit: 200 }))!.length).toBeGreaterThan(12);
  });
});
