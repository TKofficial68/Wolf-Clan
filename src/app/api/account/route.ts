import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { profiles, sessions } from "@/db/schema";
import {
  clearSessionCookie,
  getSessionUser,
  hashPassword,
  revokeOtherSessions,
  verifyPassword,
} from "@/lib/auth";
import { body, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const rows = await db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.lastUsedAt));
  return Response.json({
    sessions: rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      current: row.id === user.sessionId,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = typeof input.action === "string" ? input.action : "";

  if (action === "change-password") {
    const current = typeof input.currentPassword === "string" ? input.currentPassword : "";
    const next = typeof input.newPassword === "string" ? input.newPassword : "";
    const confirm = typeof input.confirmPassword === "string" ? input.confirmPassword : "";
    if (next.length < 8) return fail("password_short", 422);
    if (next !== confirm) return fail("password_mismatch", 422);
    const rows = await db.select({ passwordHash: profiles.passwordHash }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
    if (!rows[0] || !(await verifyPassword(current, rows[0].passwordHash))) return fail("wrong_password", 403);
    const passwordHash = await hashPassword(next);
    await db.update(profiles).set({ passwordHash, updatedAt: new Date() }).where(eq(profiles.id, user.id));
    await revokeOtherSessions(user.id, user.sessionId);
    return Response.json({ ok: true });
  }

  if (action === "revoke-others") {
    const count = await revokeOtherSessions(user.id, user.sessionId);
    return Response.json({ ok: true, count });
  }

  if (action === "revoke") {
    const sessionId = typeof input.sessionId === "string" ? input.sessionId : "";
    if (!sessionId) return fail("not_found", 404);
    const rows = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)))
      .returning({ id: sessions.id });
    if (!rows.length) return fail("not_found", 404);
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    const password = typeof input.password === "string" ? input.password : "";
    const word = typeof input.deleteWord === "string" ? input.deleteWord.trim() : "";
    if (word !== "DELETE") return fail("delete_word", 422);
    const rows = await db.select({ passwordHash: profiles.passwordHash }).from(profiles).where(eq(profiles.id, user.id)).limit(1);
    if (!rows[0] || !(await verifyPassword(password, rows[0].passwordHash))) return fail("wrong_password", 403);
    await db.delete(profiles).where(eq(profiles.id, user.id));
    await clearSessionCookie();
    return Response.json({ ok: true });
  }

  return fail("not_found", 404);
}
