import { store } from "@/lib/data";
import { getReplyAudio } from "@/lib/api/handlers";

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]/audio">) {
  const { id } = await ctx.params;
  return getReplyAudio(await store(), id);
}
