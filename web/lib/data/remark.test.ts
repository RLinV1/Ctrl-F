import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { cleanRemark, remark } from "./narrate";
import { S3Store } from "./s3-store";

/** An in-memory bucket and a store whose Gemini and ElevenLabs calls are stubs. */
function fixture({ quip = "Smile for the lens, old chap.", speak }: { quip?: string | null; speak?: () => Promise<{ audio: Buffer; timings: [] }> } = {}) {
  const objects = new Map<string, string>();
  const client = {
    send: async (command: unknown) => {
      const c = command as { input: { Key?: string; Prefix?: string; Body?: string } };
      if (command instanceof ListObjectsV2Command)
        return { Contents: [...objects.keys()].filter((k) => k.startsWith(c.input.Prefix!)).map((Key) => ({ Key, LastModified: new Date(), Size: 1 })) };
      if (command instanceof PutObjectCommand) {
        objects.set(c.input.Key!, String(c.input.Body));
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const value = objects.get(c.input.Key!);
        if (!value) throw Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
        return { Body: { transformToByteArray: async () => Buffer.from(value) } };
      }
      throw new Error("unexpected command");
    },
  } as unknown as S3Client;
  const remarkStub = vi.fn(async () => quip);
  const store = new S3Store({
    client,
    sign: async (key) => `https://photos.invalid/${key}`,
    services: {
      pickTargets: async () => ({ targets: ["keys"], unsupported: null }),
      narrate: async () => "Your keys are on the desk.",
      speak: speak ?? (async () => ({ audio: Buffer.from("voice"), timings: [] })),
      remark: remarkStub,
    },
  });
  return { store, objects, remarkStub };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("the narrator's remark when the photo is taken", () => {
  it("is worded and voiced once the photo lands, and offered only while the question is unanswered", async () => {
    const { store, objects, remarkStub } = fixture();
    const job = await store.askText("Where are my keys?");
    expect((await store.getJob(job.id))?.remark).toBeNull(); // no photo yet

    objects.set(`incoming/${job.id}.jpg`, "photo");
    expect((await store.getJob(job.id))?.status).toBe("claimed");
    await settle();
    const waiting = await store.getJob(job.id);
    expect(waiting?.remark).toMatchObject({ text: "Smile for the lens, old chap.", audioUrl: `/api/jobs/${job.id}/remark` });
    expect(remarkStub).toHaveBeenCalledTimes(1);
    expect(remarkStub).toHaveBeenCalledWith("keys", "Where are my keys?");
    expect(await store.remarkAudio(job.id)).toEqual(Buffer.from("voice"));

    await store.getJob(job.id); // further polls do not ask again
    expect(remarkStub).toHaveBeenCalledTimes(1);

    objects.set(`results/${job.id}_result.json`, JSON.stringify({ status: "found", target: "keys", matches: [], detections: [] }));
    objects.set(`results/${job.id}_result.jpg`, "annotated");
    const done = await store.getJob(job.id);
    expect(done?.status).toBe("done");
    expect(done?.remark).toBeNull(); // the answer replaces it
  });

  it("is dropped when its voice is not ready before the answer", async () => {
    let voice!: () => void;
    const { store, objects } = fixture({
      speak: () => new Promise((resolve) => { voice = () => resolve({ audio: Buffer.from("late"), timings: [] }); }),
    });
    const job = await store.askText("Where are my keys?");
    objects.set(`incoming/${job.id}.jpg`, "photo");
    await store.getJob(job.id);
    await settle();

    // The answer arrives first...
    objects.set(`results/${job.id}_result.json`, JSON.stringify({ status: "found", target: "keys", matches: [], detections: [] }));
    objects.set(`results/${job.id}_result.jpg`, "annotated");
    expect((await store.getJob(job.id))?.status).toBe("done");
    voice(); // ...then the remark's voice
    await settle();
    expect(await store.remarkAudio(job.id)).toBeNull();
    expect((await store.getJob(job.id))?.remark).toBeNull();
  });

  it("is skipped when Gemini gives nothing", async () => {
    const { store, objects, remarkStub } = fixture({ quip: null });
    const job = await store.askText("Where are my keys?");
    objects.set(`incoming/${job.id}.jpg`, "photo");
    await store.getJob(job.id);
    await settle();
    expect((await store.getJob(job.id))?.remark).toBeNull();
    await store.getJob(job.id);
    await settle();
    expect(remarkStub).toHaveBeenCalledTimes(1);
  });
});

describe("failed optional remark attempts", () => {
  it("does not retry a failed TTS call on later polls", async () => {
    const speak = vi.fn(async () => { throw new Error("mock voice unavailable"); });
    const {store,objects,remarkStub} = fixture({speak});
    const job = await store.askText("keys");
    objects.set(`incoming/${job.id}.jpg`,"photo");
    await store.getJob(job.id);
    await settle();
    for (let poll=0; poll<3; poll++) await store.getJob(job.id);
    await settle();
    expect(remarkStub).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect((await store.getJob(job.id))?.remark).toBeNull();
    objects.set(`results/${job.id}_result.json`,JSON.stringify({status:"found",target:"keys",matches:[],detections:[]}));
    objects.set(`results/${job.id}_result.jpg`,"annotated");
    expect((await store.getJob(job.id))?.status).toBe("done");
  });

  it("does not retry a rejected wording call on later polls", async () => {
    const {store,objects,remarkStub} = fixture();
    remarkStub.mockRejectedValue(new Error("mock wording unavailable"));
    const job = await store.askText("keys");
    objects.set(`incoming/${job.id}.jpg`,"photo");
    await store.getJob(job.id);
    await settle();
    await Promise.all([store.getJob(job.id),store.getJob(job.id)]);
    await settle();
    expect(remarkStub).toHaveBeenCalledTimes(1);
    expect((await store.getJob(job.id))?.remark).toBeNull();
  });
});

describe("remark wording", () => {
  it("is null without a Gemini key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await remark("keys", "Where are my keys?")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("is one clean line, cut at a sentence when Gemini runs long", () => {
    expect(cleanRemark('  "Hold still,\n keys!"  ')).toBe("Hold still, keys!");
    expect(cleanRemark("   ")).toBeNull();
    const long = `${"A rather fine exposure indeed. ".repeat(10)}`;
    const cut = cleanRemark(long)!;
    expect(cut.length).toBeLessThanOrEqual(200);
    expect(cut.endsWith(".")).toBe(true);
  });
});
