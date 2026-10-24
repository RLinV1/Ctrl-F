import { store } from "@/lib/data";
import { postUpload } from "@/lib/api/handlers";

export async function POST(request: Request) {
  return postUpload(await store(), request);
}
