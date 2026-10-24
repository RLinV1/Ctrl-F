import { describe, expect, it } from "vitest";
import { DONE_AFTER_MS, MockStore } from "../data/mock/store";
import { getLatestJob, postCorrection, postDeviceJob, postJob } from "./handlers";

const json = (body: unknown) =>
  new Request("http://x/api/jobs", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const audio = (headers: Record<string, string>, bytes = new Uint8Array([1, 2, 3])) =>
  new Request("http://x/api", { method: "POST", body: bytes, headers });

function setup() {
  const t = { now: 5_000_000 };
  return { t, store: new MockStore(() => t.now) };
}

describe("postJob", () => {
  it("queues a recording sent as the body", async () => {
    const { store } = setup();
    const res = await postJob(store, audio({ "content-type": "audio/webm;codecs=opus" }));
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe("pending");
    expect((await postJob(store, audio({ "content-type": "text/plain" }))).status).toBe(400);
    expect((await postJob(store, audio({ "content-type": "audio/webm" }, new Uint8Array()))).status).toBe(400);
  });

  it("queues a typed question, with the text as the transcript", async () => {
    const { t, store } = setup();
    const res = await postJob(store, json({ text: "  where are my glasses " }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    t.now += DONE_AFTER_MS;
    expect((await store.getJob(id))!.transcript).toBe("where are my glasses");
  });

  it("rejects empty and over-long text", async () => {
    const { store } = setup();
    expect((await postJob(store, json({ text: "   " }))).status).toBe(400);
    expect((await postJob(store, json({ text: "x".repeat(301) }))).status).toBe(400);
    expect((await postJob(store, json({}))).status).toBe(400);
  });
});

describe("the camera's button", () => {
  it("takes a recording from the Pi's mic with the Pi token only", async () => {
    const { store } = setup();
    const since = new Date(4_000_000).toISOString();
    const latest = () => getLatestJob(store, new URL(`http://x/api/jobs/latest?source=device&since=${since}`));

    expect((await postDeviceJob(store, audio({ "content-type": "audio/webm" }), "pi")).status).toBe(401);
    expect((await postDeviceJob(store, audio({ "content-type": "audio/webm", authorization: "Bearer nope" }), "pi")).status).toBe(401);
    expect((await postDeviceJob(store, audio({ "content-type": "audio/webm", authorization: "Bearer pi" }), undefined)).status).toBe(401);
    expect((await latest()).status).toBe(204);

    const res = await postDeviceJob(store, audio({ "content-type": "audio/webm", authorization: "Bearer pi" }), "pi");
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(await (await latest()).json()).toEqual({ id });
  });

  it("checks the latest-job query", async () => {
    const { store } = setup();
    expect((await getLatestJob(store, new URL("http://x/?source=pi&since=2026-01-01T00:00:00Z"))).status).toBe(400);
    expect((await getLatestJob(store, new URL("http://x/?source=device&since=soon"))).status).toBe(400);
  });
});

describe("postCorrection", () => {
  it("re-words a finished answer and refuses one still waiting", async () => {
    const { t, store } = setup();
    const { id } = await store.createJob(new Uint8Array([1]), "audio/webm");
    const correct = (body: unknown) => postCorrection(store, id, json(body));
    expect((await correct({ found: false })).status).toBe(409);
    t.now += DONE_AFTER_MS;
    expect((await correct({ found: "no" })).status).toBe(400);
    const res = await correct({ found: false });
    expect(res.status).toBe(200);
    expect((await res.json()).corrected).toBe(true);
    expect((await postCorrection(store, "nope", json({ found: true }))).status).toBe(404);
  });
});
