import { store } from "@/lib/data";
import { getJob } from "@/lib/api/handlers";

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  return getJob(await store(), id);
}
