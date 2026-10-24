import { store } from "@/lib/data";
import type { Store } from "@/lib/data/store";

type MockUploads = Store & { storeAudio(key: string): void };
const isMock = (s: Store): s is MockUploads => typeof (s as Partial<MockUploads>).storeAudio === "function";

/** Mock mode only: GET says whether a press can be simulated; POST simulates one. 404 otherwise. */
export async function GET() {
  return (isMock(await store())) ? Response.json({ available: true }) : new Response(null, { status: 404 });
}

export async function POST() {
  const data = await store();
  if (!isMock(data)) return new Response(null, { status: 404 });
  const audioKey = `audio/device/${crypto.randomUUID()}.webm`;
  data.storeAudio(audioKey);
  await data.touchDevice("pi");
  return Response.json(await data.createJob({ audioKey }, "device"), { status: 201 });
}
