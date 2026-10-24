import { store } from "@/lib/data";
import { getLatestJob } from "@/lib/api/handlers";

export async function GET(request: Request) {
  return getLatestJob(await store(), new URL(request.url));
}
