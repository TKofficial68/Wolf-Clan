import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/http";
import { loadHomeData } from "@/lib/home-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail("Unauthorized", 401);
  const data = await loadHomeData(user);
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
