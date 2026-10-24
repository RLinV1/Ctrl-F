import { store } from "@/lib/data";
import type { Store } from "@/lib/data/store";
import type { JobView } from "@/lib/data/types";

type MockPress = Store & { simulatePress(): Promise<JobView> };
// Duck-typed: each route bundle has its own copy of the MockStore class, so instanceof would fail.
const isMock = (s: Store): s is MockPress => typeof (s as Partial<MockPress>).simulatePress === "function";

/** Mock mode only: GET says whether a press can be simulated; POST simulates one. 404 otherwise. */
export async function GET() {
  return isMock(await store()) ? Response.json({ available: true }) : new Response(null, { status: 404 });
}

export async function POST() {
  const data = await store();
  if (!isMock(data)) return new Response(null, { status: 404 });
  return Response.json(await data.simulatePress(), { status: 201 });
}
