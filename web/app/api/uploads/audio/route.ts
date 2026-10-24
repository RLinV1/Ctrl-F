import { store } from "@/lib/data";
import { putAudio } from "@/lib/api/handlers";

export async function PUT(request: Request) {
  return putAudio(await store(), request);
}
