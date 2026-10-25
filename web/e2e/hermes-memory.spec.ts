import { test, expect } from "@playwright/test";
import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3Store } from "../lib/data/s3-store";
import { postDeviceJob, getLatestJob } from "../lib/api/handlers";
import { factsFor, plainReply, pickTargets, type Result } from "../lib/data/narrate";

test.beforeEach(() => { process.env.DATABASE_URL = ""; });

const evidence = { detection_id: "prior", item_id: "keys-id", photo_id: "old-photo", seen_at: "2026-10-24T14:35:00Z",
  label: "keys", confidence: null, bbox: { x: .2, y: .3, w: .1, h: .1 }, zone: "desk",
  location_description: "On the desk beside the red mug", s3_key: "incoming/old-photo.jpg",
  annotated_key: "results/old-photo_result.jpg", width: 1280, height: 720 };
const result: Result = { version: 2, status: "not_visible", target: "keys", matches: [], detections: [],
  width: 1280, height: 720, captured_at: "2026-10-25T10:00:00Z", history_status: "available", last_sighting: evidence };

// This integration uses real handlers/store and mocks only the external boundaries.
function fixture(objects = new Map<string, string>()) {
  const client = { send: async (command: unknown) => {
    const c = command as {input: {Key?: string; Prefix?: string; Body?: string}};
    if (command instanceof ListObjectsV2Command) return {Contents: [...objects.keys()].filter(k => k.startsWith(c.input.Prefix!))
      .map(Key => ({Key, LastModified: new Date(), Size: objects.get(Key)!.length}))};
    if (command instanceof PutObjectCommand) { objects.set(c.input.Key!, c.input.Body!); return {}; }
    if (command instanceof GetObjectCommand) {
      const value = objects.get(c.input.Key!);
      if (!value) throw Object.assign(new Error("missing"), {name: "NoSuchKey", $metadata: {httpStatusCode: 404}});
      return {Body: {transformToByteArray: async () => Buffer.from(value)}};
    }
    throw new Error("Unexpected external command");
  }} as unknown as S3Client;
  const store = new S3Store({client, sign: async key => `https://photos.invalid/${key}`, services: {
    transcribe: async () => "Where are my keys?", narrate: async facts => plainReply(facts),
    speak: async () => ({audio: Buffer.from("mock voice"), timings: []}),
    pickTargets,
  }});
  return {store, objects};
}

test("both trigger handlers reach validated historical evidence and voice", async () => {
  const {store, objects} = fixture();
  const since = new Date(Date.now() - 1000).toISOString();
  const response = await postDeviceJob(store, new Request("http://test/api/device/jobs", {method: "POST",
    headers: {authorization: "Bearer pi-secret", "content-type": "audio/ogg"}, body: "fake audio"}), "pi-secret");
  expect(response.status).toBe(201);
  const queued = await response.json();
  const discover = await getLatestJob(store, new URL(`http://test/api/jobs/latest?source=device&since=${since}`));
  expect((await discover.json()).id).toBe(queued.id);
  const web = await store.createJob(new Uint8Array([1]), "audio/webm");
  for (const id of [queued.id, web.id]) {
    objects.set(`results/${id}_result.json`, JSON.stringify(result));
    objects.set(`results/${id}_result.jpg`, "mock image");
    const done = await store.getJob(id);
    expect(done?.status).toBe("done");
    expect(done?.lastSighting?.snapshot.url).toContain("old-photo_result.jpg");
    expect(done?.match).toBeNull();
    expect(done?.replyText).toContain("desk beside the red mug");
    expect(done?.historyStatus).toBe("available");
    await expect.poll(async () => (await store.getJob(id))?.replyAudioUrl).toBe(`/api/jobs/${id}/audio`);
  }
});

test("failed processing finishes without requiring a success image", async () => {
  const {store, objects} = fixture();
  const job = await store.askText("keys");
  objects.set(`results/${job.id}_result.json`, JSON.stringify({version: 2, status: "failed", error: "Analysis failed"}));
  expect((await store.getJob(job.id))?.status).toBe("failed");
});

test("history unavailability is distinct from never seen", () => {
  const unavailable = factsFor({...result, history_status: "unavailable", last_sighting: null});
  expect(unavailable.never_seen_before).toBeUndefined();
  expect(plainReply(unavailable)).toContain("history cannot currently be checked");
  expect(plainReply(factsFor({...result, history_status: "never_seen", last_sighting: null}))).toContain("has not seen");
  expect(factsFor({status: "found", target: "keys", matches: [{name:"keys", conf:null, box:[.1,.1,.2,.2], location_description:"On the desk"}], detections: []})).not.toHaveProperty("confidence_percent");
});


test("legacy found results remain readable without memory claims", async () => {
  const {store, objects} = fixture();
  const job = await store.askText("keys");
  const detection = {name:"keys",conf:.9,box:[.1,.2,.3,.4]};
  objects.set(`results/${job.id}_result.json`, JSON.stringify({status:"found",target:"keys",matches:[detection],detections:[detection]}));
  objects.set(`results/${job.id}_result.jpg`, "mock image");
  const done = await store.getJob(job.id);
  expect(done?.found).toBe(true);
  expect(done?.match?.confidence).toBe(.9);
  expect(done?.match?.box.x).toBe(.1);
});

test("discovery cursor does not skip jobs sharing a timestamp", async () => {
  const {store} = fixture();
  const first = await store.createJob(new Uint8Array([1]), "audio/ogg", "device");
  const second = await store.createJob(new Uint8Array([1]), "audio/ogg", "device");
  const since = new Date(Date.parse(first.createdAt)-1000).toISOString();
  const discovered = await getLatestJob(store, new URL(`http://test/api/jobs/latest?source=device&since=${since}`));
  const one = await discovered.json();
  const after = await getLatestJob(store, new URL(`http://test/api/jobs/latest?source=device&since=${one.createdAt}&afterId=${one.id}`));
  const two = await after.json();
  expect(new Set([one.id,two.id])).toEqual(new Set([first.id,second.id]));
});


const deviceRequestId = "6c5cd856-75f5-4a09-824d-452a3cc6ce90";
function readyRequest() {
  return {version:1, source:"device", id:deviceRequestId, created_at:"2026-01-01T10:00:00+00:00", captured_at:"2026-01-01T10:00:02+00:00",
    audio_key:`incoming/device/${deviceRequestId}.ogg`, image_key:`incoming/device/${deviceRequestId}.jpeg`,audio_content_type:"audio/ogg"};
}

test("S3-only Pi request is discoverable without HTTP submission after web restart", async () => {
  const objects = new Map<string,string>();
  const manifest = readyRequest();
  objects.set(`incoming/device/${deviceRequestId}.ready.json`,JSON.stringify(manifest));
  objects.set(`results/${deviceRequestId}_result.json`,JSON.stringify({...result,source:"device",transcript:"Where are my keys?",targets:["keys"],created_at:manifest.created_at}));
  objects.set(`results/${deviceRequestId}_result.jpg`,"mock image");
  for (let restart = 0; restart < 2; restart++) {
    const {store} = fixture(objects);
    expect(await store.latestJobId("device",new Date(0).toISOString())).toBe(deviceRequestId);
    const done = await store.getJob(deviceRequestId);
    expect(done?.transcript).toBe("Where are my keys?");
    expect(done?.lastSighting?.snapshot.url).toContain("old-photo_result.jpg");
    expect(done?.replyText).toContain("desk beside the red mug");
  }
});

test("raw uploads without a valid ready manifest are not discovered", async () => {
  const {store,objects} = fixture();
  objects.set(`incoming/device/${deviceRequestId}.ogg`,"raw audio");
  objects.set(`incoming/device/${deviceRequestId}.jpeg`,"image");
  expect(await store.latestJobId("device",new Date(0).toISOString())).toBeNull();
});

test("newly discovered ready request shows processing before a result exists", async () => {
  const {store,objects} = fixture();
  objects.set(`incoming/device/${deviceRequestId}.ready.json`,JSON.stringify(readyRequest()));
  const job = await store.getJob(deviceRequestId);
  expect(job?.status).toBe("claimed");
  expect(job?.found).toBeNull();
});


test("unconfigured bottle and mixed targets reach S3 and render factual voice results", async () => {
  const {store,objects} = fixture();
  const job = await store.askText("Where are my bottle and keys?");
  expect(JSON.parse(objects.get(`jobs/${job.id}.json`)!).targets).toEqual(["bottle", "keys"]);
  const detection = {name:"bottle",conf:null,box:[.1,.2,.3,.7],location_description:"On the desk beside the notebook"};
  objects.set(`results/${job.id}_result.json`,JSON.stringify({version:2,status:"found",target:"bottle",matches:[detection],detections:[detection],history_status:"not_needed",persisted:true}));
  objects.set(`results/${job.id}_result.jpg`,"mock image");
  const done = await store.getJob(job.id);
  expect(done?.found).toBe(true);
  expect(done?.replyText).toContain("bottle");
  expect(done?.replyText).toContain("beside the notebook");
  await expect.poll(async () => (await store.getJob(job.id))?.replyAudioUrl).toBe(`/api/jobs/${job.id}/audio`);
});
