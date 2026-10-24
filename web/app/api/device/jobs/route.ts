import { store } from "@/lib/data";
import { postDeviceJob } from "@/lib/api/handlers";

/** The Pi posts a recording from the camera's mic after its button is pressed. Pi token only. */
export async function POST(request: Request) {
  return postDeviceJob(await store(), request, process.env.PI_JOB_TOKEN);
}
