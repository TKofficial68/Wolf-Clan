import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { announcementReads, announcements, notifications, profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { avatarUrl } from "@/lib/home-data";
import { canManageAnnouncements } from "@/lib/roles";

export const dynamic = "force-dynamic";

export type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; displayName: string; role: string; title: string | null; avatarUrl: string | null };
  readCount: number;
  isRead: boolean;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);

  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      pinned: announcements.pinned,
      imageUploadId: announcements.imageUploadId,
      createdAt: announcements.createdAt,
      updatedAt: announcements.updatedAt,
      authorId: profiles.id,
      authorName: profiles.displayName,
      authorRole: profiles.role,
      authorTitle: profiles.title,
      authorAvatar: profiles.avatarUploadId,
    })
    .from(announcements)
    .innerJoin(profiles, eq(profiles.id, announcements.authorId))
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt));

  const ids = rows.map((r) => r.id);
  const readRows = ids.length
    ? await db
        .select({ announcementId: announcementReads.announcementId, userId: announcementReads.userId })
        .from(announcementReads)
        .where(inArray(announcementReads.announcementId, ids))
    : [];

  const items: AnnouncementItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    pinned: row.pinned,
    imageUrl: row.imageUploadId ? `/api/uploads/${row.imageUploadId}` : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    author: {
      id: row.authorId,
      displayName: row.authorName,
      role: row.authorRole,
      title: row.authorTitle,
      avatarUrl: avatarUrl(row.authorAvatar),
    },
    readCount: readRows.filter((r) => r.announcementId === row.id).length,
    isRead: readRows.some((r) => r.announcementId === row.id && r.userId === user.id),
  }));

  return Response.json(
    { items, canManage: canManageAnnouncements(user.role) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  if (!canManageAnnouncements(user.role)) return fail("forbidden", 403);

  const input = await body<Record<string, unknown>>(request);
  const title = stringField(input.title, 80);
  const message = stringField(input.body, 2000);
  const imageUploadId = stringField(input.imageUploadId, 60) || null;
  if (title.length < 3) return fail("title_required", 422);
  if (message.length < 3) return fail("body_required", 422);

  const inserted = await db
    .insert(announcements)
    .values({ title, body: message, imageUploadId, authorId: user.id })
    .returning({ id: announcements.id });

  await db.insert(announcementReads).values({ announcementId: inserted[0].id, userId: user.id }).onConflictDoNothing();

  const others = await db.select({ id: profiles.id }).from(profiles).where(sql`${profiles.id} <> ${user.id}`);
  if (others.length) {
    await db.insert(notifications).values(
      others.map((row) => ({
        userId: row.id,
        kind: "announcement",
        title,
        body: message.slice(0, 140),
        href: "/announcements",
      })),
    );
  }

  return Response.json({ ok: true, id: inserted[0].id });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  if (!canManageAnnouncements(user.role)) return fail("forbidden", 403);

  const input = await body<Record<string, unknown>>(request);
  const id = stringField(input.id, 60);
  if (!id) return fail("not_found", 404);

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof input.title === "string") {
    const title = stringField(input.title, 80);
    if (title.length < 3) return fail("title_required", 422);
    set.title = title;
  }
  if (typeof input.body === "string") {
    const message = stringField(input.body, 2000);
    if (message.length < 3) return fail("body_required", 422);
    set.body = message;
  }
  if (typeof input.pinned === "boolean") set.pinned = input.pinned;
  if (typeof input.imageUploadId === "string") set.imageUploadId = input.imageUploadId || null;

  const updated = await db.update(announcements).set(set).where(eq(announcements.id, id)).returning({ id: announcements.id });
  if (!updated.length) return fail("not_found", 404);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  if (!canManageAnnouncements(user.role)) return fail("forbidden", 403);
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) return fail("not_found", 404);
  const removed = await db.delete(announcements).where(eq(announcements.id, id)).returning({ id: announcements.id });
  if (!removed.length) return fail("not_found", 404);
  return Response.json({ ok: true });
}
