import { store } from "@/lib/data";
import { getRemarkAudio } from "@/lib/api/handlers";

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]/remark">) {
  const { id } = await ctx.params;
  return getRemarkAudio(await store(), id);
}
