import { db } from "@/db";
import { announcementReads, announcements } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/http";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const rows = await db.select({ id: announcements.id }).from(announcements);
  if (rows.length) {
    await db
      .insert(announcementReads)
      .values(rows.map((row) => ({ announcementId: row.id, userId: user.id })))
      .onConflictDoNothing();
  }
  return Response.json({ ok: true, count: rows.length });
}
