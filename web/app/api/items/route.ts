import { store } from "@/lib/data";
import { getItems } from "@/lib/api/handlers";

export async function GET() {
  return getItems(await store());
}
