import { store } from "@/lib/data";
import { postJob } from "@/lib/api/handlers";

export async function POST(request: Request) {
  return postJob(await store(), request);
}
