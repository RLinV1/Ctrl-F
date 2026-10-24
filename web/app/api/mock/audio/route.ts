import { store } from "@/lib/data";
import type { Store } from "@/lib/data/store";

type MockUploads = Store & { storeAudio(key: string): void };

/** Route bundles each carry their own copy of the MockStore class, so check the method, not the class. */
const acceptsUploads = (s: Store): s is MockUploads =>
  typeof (s as Partial<MockUploads>).storeAudio === "function";

/** Mock-mode stand-in for the presigned storage PUT. 404 outside mock mode. */
export async function PUT(request: Request) {
  const data = await store();
  if (!acceptsUploads(data)) return new Response(null, { status: 404 });
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if ((await request.arrayBuffer()).byteLength === 0) {
    return Response.json({ error: "empty upload" }, { status: 400 });
  }
  try {
    data.storeAudio(key);
  } catch {
    return Response.json({ error: "bad key" }, { status: 400 });
  }
  return new Response(null, { status: 200 });
}
