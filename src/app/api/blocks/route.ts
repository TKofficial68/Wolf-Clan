import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, userBlocks } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { avatarUrl } from "@/lib/home-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const rows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      username: profiles.username,
      role: profiles.role,
      avatarUploadId: profiles.avatarUploadId,
      createdAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(profiles, eq(profiles.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, user.id));
  return Response.json({
    blocked: rows.map((row) => ({ ...row, avatarUrl: avatarUrl(row.avatarUploadId) })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const input = await body<{ userId?: string }>(request);
  const targetId = stringField(input.userId, 60);
  if (!targetId || targetId === user.id) return fail("invalid_target", 422);
  await db.insert(userBlocks).values({ blockerId: user.id, blockedId: targetId }).onConflictDoNothing();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const targetId = url.searchParams.get("userId") ?? "";
  if (!targetId) return fail("not_found", 404);
  await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, user.id), eq(userBlocks.blockedId, targetId)));
  return Response.json({ ok: true });
}
