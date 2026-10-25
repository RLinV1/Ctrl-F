import { test, expect } from "@playwright/test";
import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3Store } from "../lib/data/s3-store";
import { postDeviceJob, getLatestJob } from "../lib/api/handlers";
import { factsFor, plainReply, pickTargets, narrate, type Result } from "../lib/data/narrate";

test.beforeEach(() => { process.env.DATABASE_URL = ""; });

const evidence = { detection_id: "prior", item_id: "keys-id", photo_id: "old-photo", seen_at: "2026-10-24T14:35:00Z",
  label: "keys", confidence: null, bbox: { x: .2, y: .3, w: .1, h: .1 }, zone: "desk",
  location_description: "On the desk beside the red mug", s3_key: "incoming/old-photo.jpg",
  annotated_key: "results/old-photo_result.jpg", width: 1280, height: 720 };
const result: Result = { version: 2, status: "not_visible", target: "keys", matches: [], detections: [],
  width: 1280, height: 720, captured_at: "2026-10-25T10:00:00Z", history_status: "available", last_sighting: evidence };

// This integration uses real handlers/store and mocks only the external boundaries.
function fixture(objects = new Map<string, string>(), transcript = "Where are my keys?", remarkProvider = async (): Promise<string | null> => null) {
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
    transcribe: async () => transcript, narrate: async facts => plainReply(facts),
    speak: async () => ({audio: Buffer.from("mock voice"), timings: []}),
    pickTargets, remark: remarkProvider,
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
    expect(done?.lastSighting?.snapshot.url).toContain("incoming/old-photo.jpg");
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
    expect(done?.lastSighting?.snapshot.url).toContain("incoming/old-photo.jpg");
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


const caseDetection = {name:"airpods case",conf:null,box:[.449,.51,.583,.719] as [number,number,number,number],location_description:"Just left of the phone"};
const phoneDetection = {name:"phone",conf:null,box:[.594,.278,.873,.847] as [number,number,number,number],location_description:"On the right-center of the wooden table, screen facing up"};
const caseResult: Result = {version:2,status:"found",target:"phone",matches:[phoneDetection],detections:[phoneDetection,caseDetection],
  items:[{item:"airpods",status:"not_visible",matches:[],history_status:"never_seen",last_sighting:null},
    {item:"phone",status:"found",matches:[phoneDetection],history_status:"not_needed",last_sighting:null}]};

test("AirPods case reference cannot turn into confirmed earbuds in multi-item narration", async () => {
  const facts = factsFor(caseResult);
  expect(facts.items).toMatchObject([{item:"airpods",status:"not_visible",visible_related_objects:["airpods case"]},{item:"phone",status:"found"}]);
  const reply = await narrate(facts);
  expect(reply).toContain("I can see the airpods case, but cannot confirm the earbuds themselves are visible");
  expect(reply).toContain("Your phone is On the right-center");
  expect(reply).toContain("right of the airpods case");
  expect(reply).not.toContain("nowhere");
  expect(reply.indexOf("earbuds")).toBeLessThan(reply.indexOf("Your phone"));
});

test("multi-item plain fallback preserves each target and its independent history", () => {
  const mixed: Result = {...caseResult,items:[
    {item:"keys",status:"not_visible",matches:[],history_status:"available",last_sighting:evidence},
    {item:"phone",status:"found",matches:[phoneDetection],history_status:"not_needed"},
    {item:"wallet",status:"not_visible",matches:[],history_status:"unavailable"}]};
  const reply = plainReply(factsFor(mixed));
  expect(reply).toContain("last seen On the desk beside the red mug");
  expect(reply).toContain("Your phone");
  expect(reply).toContain("I cannot see your wallet now, and history cannot currently be checked.");
  expect(reply.indexOf("keys")).toBeLessThan(reply.indexOf("phone"));
  expect(reply.indexOf("Your phone")).toBeLessThan(reply.indexOf("wallet"));
});


test("conversational typed and recorded requests queue only physical item phrases", async () => {
  const transcript = "Yo, where is my, uh, red water bottle and phone?";
  const {store,objects} = fixture(new Map<string,string>(),transcript);
  const typed = await store.askText(transcript);
  const recorded = await store.createJob(new Uint8Array([1]),"audio/webm");
  for (const job of [typed,recorded]) {
    expect(JSON.parse(objects.get(`jobs/${job.id}.json`)!).targets).toEqual(["red water bottle","phone"]);
  }
});

test("old junk item names do not become targets", async () => {
  expect(await pickTargets("Where is my, uh, water bottle?",["my","uh","yo","bottle"])).toEqual({targets:["water bottle"],unsupported:null});
  expect(await pickTargets("my, uh, yo",["my","uh","yo"])).toEqual({targets:[],unsupported:null});
});


for (const source of ["web", "legacy-device", "device"] as const) {
  test(`original photo backs current and stored snapshots for ${source}`, async () => {
    const {store,objects} = fixture();
    let id: string;
    if (source === "device") {
      id = deviceRequestId;
      objects.set(`incoming/device/${id}.ready.json`,JSON.stringify(readyRequest()));
    } else {
      id = (await store.createJob(new Uint8Array([1]),"audio/ogg",source === "legacy-device" ? "device" : "web")).id;
    }
    const detection = {name:"keys",conf:null,box:[.1,.2,.3,.4],location_description:"Beside the phone"};
    const incidental = {name:"phone",conf:null,box:[.6,.2,.8,.5]};
    objects.set(`results/${id}_result.json`,JSON.stringify({version:2,status:"found",target:"keys",matches:[detection],detections:[detection,incidental],
      ...(source === "device" ? {source:"device",transcript:"Where are my keys?",targets:["keys"]} : {})}));
    objects.set(`results/${id}_result.jpg`,"annotated image with all detection boxes");
    const original = source === "device" ? `incoming/device/${id}.jpeg` : `incoming/${id}.jpg`;
    objects.set(original,"original image without boxes");
    const done = await store.getJob(id);
    expect(done?.photo?.url).toBe(`https://photos.invalid/${original}`);
    expect(done?.match?.snapshot.url).toBe(`https://photos.invalid/${original}`);
    expect(done?.match?.box).toEqual({x:.1,y:.2,w:expect.closeTo(.2),h:expect.closeTo(.2)});
    const jobs = await fixture(objects).store.listJobs(10);
    expect(jobs.find(job => job.id === id)?.photo?.url).toBe(`https://photos.invalid/${original}`);
    const items = await store.listItems();
    expect(items.find(item => item.name === "keys")?.lastSeen?.snapshot.url).toBe(`https://photos.invalid/${original}`);
  });
}


test("raw camera pixels display with only the requested target circle", async ({page}) => {
  const {store,objects} = fixture();
  const job = await store.askText("Where are my keys?");
  const keys = {name:"keys",conf:null,box:[.1,.2,.3,.4],location_description:"On the desk"};
  const phone = {name:"phone",conf:null,box:[.6,.2,.8,.5]};
  objects.set(`results/${job.id}_result.json`,JSON.stringify({version:2,status:"found",target:"keys",matches:[keys],detections:[keys,phone],width:1280,height:720}));
  objects.set(`results/${job.id}_result.jpg`,"annotated pixels with keys and phone boxes");
  objects.set(`incoming/${job.id}.jpg`,"original pixels");
  const done = await store.getJob(job.id);
  const fetchedPhotos: string[] = [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1kAAAAASUVORK5CYII=","base64");
  await page.route("https://photos.invalid/**", route => {
    fetchedPhotos.push(new URL(route.request().url()).pathname);
    return route.fulfill({contentType:"image/png",body:png});
  });
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("blocked","NotAllowedError")); HTMLMediaElement.prototype.pause = () => {}; });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/status") return route.fulfill({json:[{device:"pi",online:true,lastSeenAt:new Date().toISOString()},{device:"desktop",online:true,lastSeenAt:new Date().toISOString()}]});
    if (path === "/api/items") return route.fulfill({json:[]});
    if (path === "/api/jobs/latest") return route.fulfill({status:204});
    if (path === "/api/jobs" && route.request().method() === "POST") return route.fulfill({status:201,json:{id:job.id}});
    if (path === "/api/jobs") return route.fulfill({json:[]});
    if (path === `/api/jobs/${job.id}`) return route.fulfill({json:done});
    if (path.endsWith("/audio")) return route.fulfill({contentType:"audio/mpeg",body:Buffer.from([])});
    return route.fulfill({status:404});
  });
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await expect(page.getByTestId("prompt")).toHaveAttribute("data-live", "true");
  await page.getByPlaceholder("Where are my keys?").fill("Where are my keys?");
  await page.getByRole("button",{name:"Send question"}).click();
  await expect(page.getByTestId("answer")).toContainText("Your keys");
  await page.getByRole("button",{name:"Show the camera's photo"}).click();
  await expect(page.getByAltText("Camera photo with the keys circled")).toHaveAttribute("src",`https://photos.invalid/incoming/${job.id}.jpg`);
  const mark = page.getByRole("img",{name:"keys marked",exact:true});
  await expect(mark).toBeVisible();
  await expect(mark).toHaveCSS("left",/px$/);
  await expect(page.getByRole("img",{name:/phone/})).toHaveCount(0);
  expect(fetchedPhotos).not.toContain(`/results/${job.id}_result.jpg`);
  expect(await mark.evaluate(element => ({left:element.style.left,top:element.style.top,width:element.style.width,height:element.style.height}))).toEqual({left:"10%",top:"20%",width:"20%",height:"20%"});
});


test("empty optional photo remark is not retried by repeated job polling", async () => {
  let attempts = 0;
  const {store,objects} = fixture(new Map<string,string>(),"Where are my keys?",async () => {attempts++;return null;});
  const job = await store.askText("keys");
  objects.set(`incoming/${job.id}.jpg`,"original pixels");
  for (let poll = 0; poll < 4; poll++) {
    expect((await store.getJob(job.id))?.status).toBe("claimed");
    await new Promise(resolve => setTimeout(resolve,0));
  }
  expect(attempts).toBe(1);
  objects.set(`results/${job.id}_result.json`,JSON.stringify({version:2,status:"found",target:"keys",matches:[],detections:[]}));
  objects.set(`results/${job.id}_result.jpg`,"annotated");
  expect((await store.getJob(job.id))?.status).toBe("done");
  expect(attempts).toBe(1);
});


test("Postgres results name the found second target when the first target is missing", async () => {
  const state = globalThis as unknown as {__ctrlfPool?: import("pg").Pool};
  const previous = state.__ctrlfPool;
  process.env.DATABASE_URL = "postgresql://mock-only";
  const now = new Date();
  state.__ctrlfPool = {query:async (sql:string) => ({rows:sql.includes("FROM photos p") ? [{
    id:"multi-job",taken_at:now,transcript:"Where are my airpods and phone?",targets:["airpods","phone"],found:true,
    snapshot_key:"incoming/multi-job.jpg",photo_width:1280,photo_height:720,
    det_id:"phone-sighting",label:"phone",confidence:null,location_description:"Beside the AirPods case",bbox:{x:.5,y:.2,w:.2,h:.3},
    zone:null,seen_at:now,key:"incoming/multi-job.jpg",width:1280,height:720,
  }] : []})} as unknown as import("pg").Pool;
  try {
    const {store} = fixture();
    const jobs = await store.listJobs(10);
    expect(jobs[0]).toMatchObject({target:"phone",found:true,match:{label:"phone"}});
    expect(jobs[0].match?.snapshot.url).toContain("incoming/multi-job.jpg");
  } finally {
    state.__ctrlfPool = previous;
    process.env.DATABASE_URL = "";
  }
});
