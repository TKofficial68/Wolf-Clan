import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";

export const dynamic = "force-dynamic";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  if (url.searchParams.get("count") === "1") {
    const rows = await db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, viewer.id), isNull(notifications.readAt)));
    return Response.json({ unread: Number(rows[0]?.total ?? 0) });
  }
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, viewer.id))
    .orderBy(desc(notifications.createdAt))
    .limit(80);
  const items: NotificationItem[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    read: Boolean(row.readAt),
    createdAt: new Date(row.createdAt).toISOString(),
  }));
  return Response.json(
    { items, unread: items.filter((item) => !item.read).length },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 30);
  if (action === "read-all") {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, viewer.id), isNull(notifications.readAt)));
    return Response.json({ ok: true });
  }
  if (action === "read") {
    const id = stringField(input.id, 60);
    if (!id) return fail("not_found", 404);
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, viewer.id)));
    return Response.json({ ok: true });
  }
  return fail("unknown_action", 400);
}
