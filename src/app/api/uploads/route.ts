import { db } from "@/db";
import { uploads } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/http";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("file_required", 422);
  if (!ALLOWED.includes(file.type)) return fail("invalid_type", 415);
  if (file.size > 5 * 1024 * 1024) return fail("too_large", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const inserted = await db
    .insert(uploads)
    .values({ ownerId: user.id, mime: file.type, byteSize: bytes.byteLength, data: bytes })
    .returning({ id: uploads.id });
  return Response.json({ id: inserted[0].id, url: `/api/uploads/${inserted[0].id}` });
}
