import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/http";
import { countRecentAttempts, recordAttempt } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, isAllowedFile, kindFromMime, storeMedia, type MediaKind } from "@/lib/media-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  if ((await countRecentAttempts("upload", viewer.id, 10 * 60 * 1000)) >= 40) return fail("rate_limited", 429);
  await recordAttempt("upload", viewer.id);
  const form = await request.formData().catch(() => null);
  if (!form) return fail("invalid_body", 422);
  const file = form.get("file");
  if (!(file instanceof File)) return fail("file_required", 422);
  const name = (typeof form.get("name") === "string" ? String(form.get("name")) : file.name || "file").slice(0, 180);
  if (!isAllowedFile(name, file.type)) return fail("type_not_allowed", 415);
  if (file.size > MAX_UPLOAD_BYTES) return fail(`too_large:${MAX_UPLOAD_MB}`, 413);
  const baseKind = kindFromMime(file.type);
  if (!baseKind) return fail("type_not_allowed", 415);
  const requested = typeof form.get("kind") === "string" ? String(form.get("kind")) : baseKind;
  const kind: MediaKind = requested === "voice" ? "voice" : baseKind;
  const thumb = form.get("thumb");
  const width = Number(form.get("width") ?? 0) || null;
  const height = Number(form.get("height") ?? 0) || null;
  const duration = Number(form.get("duration") ?? 0) || null;
  const permanent = form.get("permanent") === "1" && (viewer.role === "OWNER" || viewer.role === "ADMIN");

  const item = await storeMedia({
    ownerId: viewer.id,
    file,
    kind,
    name,
    width,
    height,
    duration,
    permanent,
    thumb: thumb instanceof File && thumb.size > 0 ? thumb : null,
  });
  return Response.json(item);
}

export async function GET() {
  return fail("method_not_allowed", 405);
}
