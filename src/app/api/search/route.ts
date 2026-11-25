import { and, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { directConversationMembers, directMessages, groupMembers, groupMessages, profiles, projects, reviews, tasks, uploads } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/http";
import { loadMediaMap } from "@/lib/media-server";

export const dynamic = "force-dynamic";

export type SearchGroup = {
  key: string;
  results: { id: string; title: string; subtitle: string; href: string; avatarUrl?: string | null }[];
};

const LIMIT = 6;

/** Searches only rows the caller can already read: their own conversations, groups and projects. */
export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const term = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (term.length < 2) return Response.json({ groups: [], term });

  const pattern = `%${term}%`;

  const memberRows = await db
    .select({ id: profiles.id, displayName: profiles.displayName, username: profiles.username, role: profiles.role, avatar: profiles.avatarUploadId })
    .from(profiles)
    .where(or(ilike(profiles.displayName, pattern), ilike(profiles.username, pattern)))
    .limit(LIMIT);

  const myGroups = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, viewer.id));
  const groupIds = myGroups.map((row) => row.groupId);
  const groupRows = groupIds.length
    ? await db.select({ id: groupMessages.groupId, name: sql<string>`(select name from groups g where g.id = ${groupMessages.groupId})`, body: groupMessages.body, createdAt: groupMessages.createdAt })
        .from(groupMessages)
        .where(and(inArray(groupMessages.groupId, groupIds), ilike(groupMessages.body, pattern)))
        .orderBy(desc(groupMessages.createdAt))
        .limit(LIMIT)
    : [];

  const myDms = await db.select({ conversationId: directConversationMembers.conversationId }).from(directConversationMembers).where(eq(directConversationMembers.userId, viewer.id));
  const dmIds = myDms.map((row) => row.conversationId);
  const dmRows = dmIds.length
    ? await db.select({ id: directMessages.id, conversationId: directMessages.conversationId, body: directMessages.body })
        .from(directMessages)
        .where(and(inArray(directMessages.conversationId, dmIds), ilike(directMessages.body, pattern)))
        .orderBy(desc(directMessages.createdAt))
        .limit(LIMIT)
    : [];

  const taskRows = await db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(
      or(
        ilike(tasks.title, pattern),
        ilike(tasks.description, pattern),
        sql`exists (select 1 from task_assignees a where a.task_id = ${tasks.id} and a.user_id = ${viewer.id})`,
        viewer.role === "OWNER" || viewer.role === "ADMIN" ? sql`true` : sql`false`,
      ),
    )
    .limit(LIMIT);

  const projectRows = await db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(or(ilike(projects.name, pattern), ilike(projects.description, pattern)))
    .limit(LIMIT);

  const reviewRows = await db
    .select({ id: reviews.id, title: reviews.title, game: reviews.game })
    .from(reviews)
    .where(and(or(eq(reviews.status, "APPROVED"), eq(reviews.authorId, viewer.id)), or(ilike(reviews.title, pattern), ilike(reviews.game, pattern))))
    .limit(LIMIT);

  const fileRows = await db
    .select({ id: uploads.id, name: uploads.originalName, kind: uploads.kind, byteSize: uploads.byteSize, ownerId: uploads.ownerId })
    .from(uploads)
    .where(and(ilike(uploads.originalName, pattern), or(eq(uploads.ownerId, viewer.id), ne(uploads.kind, "thumb"))))
    .limit(LIMIT);
  const mediaMap = await loadMediaMap(fileRows.map((row) => row.id));

  const groups: SearchGroup[] = [
    {
      key: "members",
      results: memberRows
        .filter((row) => row.id !== viewer.id)
        .map((row) => ({ id: row.id, title: row.displayName, subtitle: `@${row.username} · ${row.role.toLowerCase()}`, href: `/profile/${row.id}`, avatarUrl: row.avatar ? `/api/uploads/${row.avatar}` : null })),
    },
    {
      key: "messages",
      results: [
        ...groupRows.map((row) => ({ id: `g-${row.id}`, title: row.body?.slice(0, 80) ?? "", subtitle: `Group · ${row.name ?? ""}`, href: `/groups/${row.id}` })),
        ...dmRows.map((row) => ({ id: `d-${row.id}`, title: row.body?.slice(0, 80) ?? "", subtitle: "Direct message", href: `/chat/${row.conversationId}` })),
      ],
    },
    { key: "tasks", results: taskRows.map((row) => ({ id: row.id, title: row.title, subtitle: `Task · ${row.status.toLowerCase()}`, href: `/tasks/${row.id}` })) },
    { key: "projects", results: projectRows.map((row) => ({ id: row.id, title: row.name, subtitle: `Project · ${row.status.toLowerCase()}`, href: `/projects/${row.id}` })) },
    { key: "reviews", results: reviewRows.map((row) => ({ id: row.id, title: row.title, subtitle: `Review · ${row.game}`, href: `/reviews/${row.id}` })) },
    {
      key: "files",
      results: fileRows
        .filter((row) => mediaMap.has(row.id))
        .map((row) => ({ id: row.id, title: row.name ?? "file", subtitle: `File · ${row.kind}`, href: `/search?file=${row.id}` })),
    },
  ].map((group) => ({ ...group, results: group.results.slice(0, LIMIT) }));

  return Response.json({ groups, term }, { headers: { "Cache-Control": "no-store" } });
}
