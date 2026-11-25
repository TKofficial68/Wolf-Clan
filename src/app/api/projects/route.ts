import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles, projectActivity, projectMembers, projects, taskAssignees, taskComments, tasks } from "@/db/schema";
import { loadMediaMap } from "@/lib/media-server";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { hasPermission } from "@/lib/perms";
import { avatarUrl } from "@/lib/home-data";
import { notifyUsers } from "@/lib/notify";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"];

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const rows = await db
      .select({
        project: projects,
        creatorName: profiles.displayName,
      })
      .from(projects)
      .leftJoin(profiles, eq(profiles.id, projects.createdBy))
      .where(eq(projects.id, id))
      .limit(1);
    if (!rows[0]) return fail("not_found", 404);
    const memberRows = await db
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
        username: profiles.username,
        role: profiles.role,
        title: profiles.title,
        avatarUploadId: profiles.avatarUploadId,
      })
      .from(projectMembers)
      .innerJoin(profiles, eq(profiles.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, id));
    const taskRows = await db.select().from(tasks).where(eq(tasks.projectId, id)).orderBy(desc(tasks.createdAt)).limit(60);
    const taskIds = taskRows.map((row) => row.id);
    const assigneeRows = taskIds.length
      ? await db
          .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId, name: profiles.displayName, avatar: profiles.avatarUploadId })
          .from(taskAssignees)
          .innerJoin(profiles, eq(profiles.id, taskAssignees.userId))
          .where(inArray(taskAssignees.taskId, taskIds))
      : [];
    const attachmentRows = taskIds.length
      ? await db
          .select({ mediaId: taskComments.mediaId, taskId: taskComments.taskId, taskTitle: tasks.title, createdAt: taskComments.createdAt })
          .from(taskComments)
          .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
          .where(and(inArray(taskComments.taskId, taskIds), sql`${taskComments.mediaId} is not null`, sql`${taskComments.deletedAt} is null`))
          .orderBy(desc(taskComments.createdAt))
          .limit(60)
      : [];
    const mediaMap = await loadMediaMap(attachmentRows.map((row) => row.mediaId));
    const files = attachmentRows.reduce<{ id: string; name: string; kind: string; size: number; taskTitle: string }[]>((list, row) => {
      const media = row.mediaId ? mediaMap.get(row.mediaId) : undefined;
      if (media) list.push({ id: media.id, name: media.name, kind: media.kind, size: media.size, taskTitle: row.taskTitle });
      return list;
    }, []);
    const activity = await db
      .select({ id: projectActivity.id, action: projectActivity.action, detail: projectActivity.detail, createdAt: projectActivity.createdAt, actorName: profiles.displayName })
      .from(projectActivity)
      .leftJoin(profiles, eq(profiles.id, projectActivity.actorId))
      .where(eq(projectActivity.projectId, id))
      .orderBy(desc(projectActivity.createdAt))
      .limit(30);
    const canManage = rows[0].project.createdBy === viewer.id || viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "manage_projects"));
    return Response.json(
      {
        project: {
          id: rows[0].project.id,
          name: rows[0].project.name,
          description: rows[0].project.description,
          status: rows[0].project.status,
          deadline: rows[0].project.deadline ? new Date(rows[0].project.deadline).toISOString() : null,
          createdAt: new Date(rows[0].project.createdAt).toISOString(),
          creatorName: rows[0].creatorName,
          members: memberRows.map((row) => ({ ...row, avatarUrl: avatarUrl(row.avatarUploadId) })),
          tasks: taskRows.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            priority: row.priority,
            progress: row.progress,
            deadline: row.deadline ? new Date(row.deadline).toISOString() : null,
            assignees: assigneeRows.filter((entry) => entry.taskId === row.id).map((entry) => ({ id: entry.userId, displayName: entry.name, avatarUrl: avatarUrl(entry.avatar) })),
          })),
          activity: activity.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() })),
          files,
        },
        permissions: { canManage },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const filter = url.searchParams.get("filter") ?? "all";
  const search = (url.searchParams.get("q") ?? "").trim();
  const moderator = viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "manage_projects"));
  const rows = await db
    .select({ project: projects, creatorName: profiles.displayName })
    .from(projects)
    .leftJoin(profiles, eq(profiles.id, projects.createdBy))
    .where(
      and(
        filter === "active" ? eq(projects.status, "ACTIVE") : filter === "completed" ? eq(projects.status, "COMPLETED") : sql`true`,
        filter === "mine"
          ? or(eq(projects.createdBy, viewer.id), sql`exists (select 1 from project_members pm where pm.project_id = ${projects.id} and pm.user_id = ${viewer.id})`)!
          : sql`true`,
        search ? sql`(${projects.name} ilike ${`%${search}%`} or ${projects.description} ilike ${`%${search}%`})` : sql`true`,
      ),
    )
    .orderBy(desc(projects.createdAt))
    .limit(60);
  const ids = rows.map((row) => row.project.id);
  const memberRows = ids.length
    ? await db
        .select({ projectId: projectMembers.projectId, id: profiles.id, displayName: profiles.displayName, avatarUploadId: profiles.avatarUploadId })
        .from(projectMembers)
        .innerJoin(profiles, eq(profiles.id, projectMembers.userId))
        .where(inArray(projectMembers.projectId, ids))
    : [];
  const taskCountRows = ids.length
    ? await db
        .select({ projectId: tasks.projectId, total: count(), done: sql<number>`sum(case when ${tasks.status} = 'COMPLETED' then 1 else 0 end)::int` })
        .from(tasks)
        .where(inArray(tasks.projectId, ids))
        .groupBy(tasks.projectId)
    : [];
  const items = rows.map((row) => {
    const totals = taskCountRows.find((entry) => entry.projectId === row.project.id);
    return {
      id: row.project.id,
      name: row.project.name,
      description: row.project.description,
      status: row.project.status,
      deadline: row.project.deadline ? new Date(row.project.deadline).toISOString() : null,
      createdAt: new Date(row.project.createdAt).toISOString(),
      creatorName: row.creatorName,
      members: memberRows.filter((entry) => entry.projectId === row.project.id).map((entry) => ({ id: entry.id, displayName: entry.displayName, avatarUrl: avatarUrl(entry.avatarUploadId) })),
      taskCount: Number(totals?.total ?? 0),
      doneCount: Number(totals?.done ?? 0),
    };
  });
  return Response.json({ items, canManage: moderator }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 30);
  const moderator = viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "manage_projects"));
  const projectId = stringField(input.projectId ?? input.id, 60);

  if (action === "create") {
    if (!moderator) return fail("forbidden", 403);
    const name = stringField(input.name, 80);
    if (name.length < 2) return fail("invalid_name", 422);
    const existing = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, name)).limit(1);
    if (existing.length) return fail("name_taken", 409);
    const inserted = await db
      .insert(projects)
      .values({
        name,
        description: stringField(input.description, 1000),
        status: STATUSES.includes(stringField(input.status, 20)) ? stringField(input.status, 20) : "PLANNING",
        deadline: stringField(input.deadline, 40) ? new Date(stringField(input.deadline, 40)) : null,
        createdBy: viewer.id,
      })
      .returning({ id: projects.id });
    const members = Array.isArray(input.memberIds) ? input.memberIds.filter((value): value is string => typeof value === "string").slice(0, 40) : [];
    await db.insert(projectMembers).values([{ projectId: inserted[0].id, userId: viewer.id }, ...members.filter((id) => id !== viewer.id).map((userId) => ({ projectId: inserted[0].id, userId }))]);
    await db.insert(projectActivity).values({ projectId: inserted[0].id, actorId: viewer.id, action: "created", detail: name });
    await notifyUsers({ userIds: members.filter((id) => id !== viewer.id), kind: "group", title: `${viewer.displayName} added you to a project`, body: name, href: `/projects/${inserted[0].id}` });
    await audit({ actorId: viewer.id, action: "project.create", targetType: "project", targetId: inserted[0].id, detail: name });
    return Response.json({ ok: true, id: inserted[0].id });
  }

  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!rows[0]) return fail("not_found", 404);
  const canManage = rows[0].createdBy === viewer.id || moderator;
  if (action === "update") {
    if (!canManage) return fail("forbidden", 403);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof input.name === "string") {
      const name = stringField(input.name, 80);
      const clash = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.name, name), sql`${projects.id} <> ${projectId}`)).limit(1);
      if (clash.length) return fail("name_taken", 409);
      patch.name = name;
    }
    if (typeof input.description === "string") patch.description = stringField(input.description, 1000);
    if (typeof input.status === "string" && STATUSES.includes(input.status)) patch.status = input.status;
    if (typeof input.deadline === "string") patch.deadline = input.deadline ? new Date(input.deadline) : null;
    await db.update(projects).set(patch).where(eq(projects.id, projectId));
    await db.insert(projectActivity).values({ projectId, actorId: viewer.id, action: "updated", detail: null });
    return Response.json({ ok: true });
  }
  if (action === "members") {
    if (!canManage) return fail("forbidden", 403);
    if (input.add === true) {
      const userId = stringField(input.userId, 60);
      if (!userId) return fail("member_required", 422);
      await db.insert(projectMembers).values({ projectId, userId }).onConflictDoNothing();
      await notifyUsers({ userIds: [userId], kind: "group", title: `${viewer.displayName} added you to ${rows[0].name}`, href: `/projects/${projectId}` });
    } else {
      await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, stringField(input.userId, 60))));
    }
    return Response.json({ ok: true });
  }
  return fail("unknown_action", 400);
}

export const _unusedProjects = { count, asc };
