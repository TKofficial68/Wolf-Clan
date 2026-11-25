import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/http";
import { canAccessMedia, loadMediaMap } from "@/lib/media-server";

export const dynamic = "force-dynamic";

/** Metadata for a single media item, used by search results before opening the viewer. */
export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("not_found", 404);
  if (!(await canAccessMedia(viewer.id, viewer.role, id))) return fail("forbidden", 403);
  const map = await loadMediaMap([id]);
  const item = map.get(id);
  if (!item) return fail("not_found", 404);
  return Response.json(item);
}
