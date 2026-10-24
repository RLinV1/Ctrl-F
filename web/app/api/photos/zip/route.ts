import { store } from "@/lib/data";
import { getPhotoZip } from "@/lib/api/handlers";

export async function GET() {
  return getPhotoZip(await store());
}
