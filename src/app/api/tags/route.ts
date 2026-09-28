import { getAllTags } from "@/lib/stats";

export async function GET() {
  return Response.json(await getAllTags());
}
