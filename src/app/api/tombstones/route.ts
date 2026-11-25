import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/http";
import { tombstonesSince } from "@/lib/hard-delete";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const rows = await tombstonesSince(since ? new Date(since) : null);
  return Response.json({ tombstones: rows, serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
