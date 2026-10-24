import { store } from "@/lib/data";
import { postCorrection } from "@/lib/api/handlers";

/** The user's optional correction of a verdict: { found: boolean }. */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/correct">) {
  const { id } = await ctx.params;
  return postCorrection(await store(), id, request);
}
