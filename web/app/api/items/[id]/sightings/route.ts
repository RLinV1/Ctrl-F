import { store } from "@/lib/data";
import { getSightings } from "@/lib/api/handlers";

export async function GET(request: Request, ctx: RouteContext<"/api/items/[id]/sightings">) {
  const { id } = await ctx.params;
  return getSightings(await store(), id, new URL(request.url));
}
