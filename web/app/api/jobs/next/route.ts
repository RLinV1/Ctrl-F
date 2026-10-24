import { store } from "@/lib/data";
import { getNextJob } from "@/lib/api/handlers";

/** The Pi polls here with its bearer token. Never accepts a UI session. */
export async function GET(request: Request) {
  return getNextJob(await store(), request, process.env.PI_JOB_TOKEN);
}
