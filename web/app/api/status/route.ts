import { store } from "@/lib/data";
import { getStatus } from "@/lib/api/handlers";

export async function GET() {
  return getStatus(await store());
}
