import { store } from "@/lib/data";
import { getPhoto } from "@/lib/api/handlers";

export async function GET(request: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  return getPhoto(await store(), id, new URL(request.url));
}
