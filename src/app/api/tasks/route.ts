import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles, projectMembers, projects, taskActivity, taskAssignees, taskComments, tasks, groups } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, isUuid, stringField } from "@/lib/http";
import { hasPermission } from "@/lib/perms";
import { notifyUsers } from "@/lib/notify";
import { loadMediaMap } from "@/lib/media-server";
import { avatarUrl } from "@/lib/home-data";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED"];

type Assignee = { id: string; displayName: string; username: string; role: string; avatarUrl: string | null; status: string; progress: number };

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    if (!isUuid(id)) return fail("not_found", 404);
    const rows = await db
      .select({
        task: tasks,
        senderId: profiles.id,
        senderName: profiles.displayName,
        senderUsername: profiles.username,
        senderRole: profiles.role,
        senderTitle: profiles.title,
        senderAvatar: profiles.avatarUploadId,
      })
      .from(tasks)
      .leftJoin(profiles, eq(profiles.id, tasks.createdBy))
      .where(eq(tasks.id, id))
      .limit(1);
    if (!rows[0]) return fail("not_found", 404);
    const task = rows[0];
    const [assigneeRows, commentRows, activityRows, projectRow, groupRow] = await Promise.all([
      db
        .select({
          id: profiles.id,
          displayName: profiles.displayName,
          username: profiles.username,
          role: profiles.role,
          avatarUploadId: profiles.avatarUploadId,
          status: taskAssignees.status,
          progress: taskAssignees.progress,
        })
        .from(taskAssignees)
        .innerJoin(profiles, eq(profiles.id, taskAssignees.userId))
        .where(eq(taskAssignees.taskId, id)),
      db
        .select({
          comment: taskComments,
          authorName: profiles.displayName,
          authorAvatar: profiles.avatarUploadId,
          authorRole: profiles.role,
        })
        .from(taskComments)
        .innerJoin(profiles, eq(profiles.id, taskComments.authorId))
        .where(eq(taskComments.taskId, id))
        .orderBy(asc(taskComments.createdAt)),
      db
        .select({
          id: taskActivity.id,
          action: taskActivity.action,
          detail: taskActivity.detail,
          createdAt: taskActivity.createdAt,
          actorName: profiles.displayName,
        })
        .from(taskActivity)
        .leftJoin(profiles, eq(profiles.id, taskActivity.actorId))
        .where(eq(taskActivity.taskId, id))
        .orderBy(desc(taskActivity.createdAt))
        .limit(30),
      task.task.projectId ? db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, task.task.projectId)).limit(1) : Promise.resolve([]),
      task.task.groupId ? db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, task.task.groupId)).limit(1) : Promise.resolve([]),
    ]);
    const mediaMap = await loadMediaMap(commentRows.map((row) => row.comment.mediaId));
    const canManage = task.task.createdBy === viewer.id || viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "create_task"));
    const assigneeIds = assigneeRows.map((row) => row.id);
    const mine = assigneeIds.includes(viewer.id);
    return Response.json(
      {
        task: {
          id: task.task.id,
          title: task.task.title,
          description: task.task.description,
          priority: task.task.priority,
          status: task.task.status,
          progress: task.task.progress,
          deadline: task.task.deadline ? new Date(task.task.deadline).toISOString() : null,
          createdAt: new Date(task.task.createdAt).toISOString(),
          completedAt: task.task.completedAt ? new Date(task.task.completedAt).toISOString() : null,
          sender: {
            id: task.senderId,
            displayName: task.senderName ?? "Member",
            username: task.senderUsername ?? "",
            role: task.senderRole ?? "MEMBER",
            title: task.senderTitle,
            avatarUrl: avatarUrl(task.senderAvatar),
          },
          assignees: assigneeRows.map((row) => ({ ...row, avatarUrl: avatarUrl(row.avatarUploadId) })),
          project: projectRow[0] ?? null,
          group: groupRow[0] ?? null,
          comments: commentRows.map((row) => ({
            id: row.comment.id,
            body: row.comment.deletedAt ? "" : row.comment.body,
            deleted: Boolean(row.comment.deletedAt),
            createdAt: new Date(row.comment.createdAt).toISOString(),
            mine: row.comment.authorId === viewer.id,
            media: row.comment.mediaId ? (mediaMap.get(row.comment.mediaId) ?? null) : null,
            author: { id: row.comment.authorId, displayName: row.authorName, role: row.authorRole, avatarUrl: avatarUrl(row.authorAvatar) },
          })),
          activity: activityRows.map((row) => ({ id: row.id, action: row.action, detail: row.detail, createdAt: new Date(row.createdAt).toISOString(), actorName: row.actorName })),
        },
        permissions: { canManage, isAssignee: mine, canChangeStatus: mine || canManage },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const filter = url.searchParams.get("filter") ?? "mine";
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("q") ?? "").trim();
  const projectId = url.searchParams.get("projectId");
  const groupId = url.searchParams.get("groupId");
  const moderator = viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "create_tasks"));
  const scope = url.searchParams.get("scope") === "everyone" && moderator ? "everyone" : "mine";

  const conditions = [
    scope === "mine"
      ? sql`exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id} and ta.user_id = ${viewer.id})`
      : sql`true`,
    status && STATUSES.includes(status) ? eq(tasks.status, status) : sql`true`,
    projectId ? eq(tasks.projectId, projectId) : sql`true`,
    groupId ? eq(tasks.groupId, groupId) : sql`true`,
    search
      ? or(sql`${tasks.title} ilike ${`%${search}%`}`, sql`${tasks.description} ilike ${`%${search}%`}`, sql`${profiles.displayName} ilike ${`%${search}%`}`)!
      : sql`true`,
  ];

  const rows = await db
    .select({
      task: tasks,
      senderId: profiles.id,
      senderName: profiles.displayName,
      senderUsername: profiles.username,
      senderRole: profiles.role,
      senderTitle: profiles.title,
      senderAvatar: profiles.avatarUploadId,
    })
    .from(tasks)
    .leftJoin(profiles, eq(profiles.id, tasks.createdBy))
    .where(and(...conditions))
    .orderBy(filter === "deadline" ? asc(tasks.deadline) : desc(tasks.createdAt))
    .limit(80);

  const ids = rows.map((row) => row.task.id);
  const assigneeRows = ids.length
    ? await db
        .select({
          taskId: taskAssignees.taskId,
          id: profiles.id,
          displayName: profiles.displayName,
          username: profiles.username,
          role: profiles.role,
          avatarUploadId: profiles.avatarUploadId,
          status: taskAssignees.status,
          progress: taskAssignees.progress,
        })
        .from(taskAssignees)
        .innerJoin(profiles, eq(profiles.id, taskAssignees.userId))
        .where(inArray(taskAssignees.taskId, ids))
    : [];
  const projectRows = await db.select({ id: projects.id, name: projects.name }).from(projects);
  const groupRows = await db.select({ id: groups.id, name: groups.name }).from(groups);

  const now = Date.now();
  const items = rows.map((row) => {
    const assignees: Assignee[] = assigneeRows
      .filter((entry) => entry.taskId === row.task.id)
      .map((entry) => ({
        id: entry.id,
        displayName: entry.displayName,
        username: entry.username,
        role: entry.role,
        avatarUrl: avatarUrl(entry.avatarUploadId),
        status: entry.status,
        progress: entry.progress,
      }));
    const deadline = row.task.deadline ? new Date(row.task.deadline) : null;
    return {
      id: row.task.id,
      title: row.task.title,
      description: row.task.description,
      priority: row.task.priority,
      status: row.task.status,
      progress: row.task.progress,
      deadline: deadline ? deadline.toISOString() : null,
      createdAt: new Date(row.task.createdAt).toISOString(),
      overdue: Boolean(deadline && deadline.getTime() < now && row.task.status !== "COMPLETED"),
      sender: {
        id: row.senderId,
        displayName: row.senderName ?? "Member",
        username: row.senderUsername ?? "",
        role: row.senderRole ?? "MEMBER",
        title: row.senderTitle,
        avatarUrl: avatarUrl(row.senderAvatar),
      },
      assignees,
      project: projectRows.find((entry) => entry.id === row.task.projectId) ?? null,
      group: groupRows.find((entry) => entry.id === row.task.groupId) ?? null,
      canManage: row.task.createdBy === viewer.id || moderator,
    };
  });

  let deadlineBuckets: Record<string, typeof items> | null = null;
  if (filter === "deadline") {
    const buckets: Record<string, typeof items> = { overdue: [], today: [], tomorrow: [], week: [], later: [], none: [] };
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    for (const item of items) {
      if (item.status === "COMPLETED") continue;
      if (!item.deadline) {
        buckets.none.push(item);
        continue;
      }
      const delta = new Date(item.deadline).getTime() - startToday.getTime();
      const days = Math.floor(delta / 86400000);
      if (delta < 0) buckets.overdue.push(item);
      else if (days < 1) buckets.today.push(item);
      else if (days < 2) buckets.tomorrow.push(item);
      else if (days < 7) buckets.week.push(item);
      else buckets.later.push(item);
    }
    deadlineBuckets = buckets;
  }

  return Response.json({ items, buckets: deadlineBuckets, scope, canCreate: moderator || (await hasPermission(viewer, "create_tasks")) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 30);
  const taskId = stringField(input.taskId ?? input.id, 60);
  const moderator = viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "create_tasks"));

  if (action === "create") {
    if (!moderator) return fail("forbidden", 403);
    const title = stringField(input.title, 100);
    const description = stringField(input.description, 2000);
    const priority = PRIORITIES.includes(stringField(input.priority, 10)) ? stringField(input.priority, 10) : "MEDIUM";
    const deadlineRaw = stringField(input.deadline, 40);
    const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
    if (title.length < 3) return fail("invalid_title", 422);
    const assigneeIds = Array.isArray(input.assigneeIds) ? input.assigneeIds.filter((value): value is string => typeof value === "string").slice(0, 30) : [];
    const valid = assigneeIds.length ? await db.select({ id: profiles.id }).from(profiles).where(inArray(profiles.id, assigneeIds)) : [];
    if (!valid.length) return fail("assignee_required", 422);
    const inserted = await db
      .insert(tasks)
      .values({
        title,
        description,
        priority,
        deadline,
        projectId: stringField(input.projectId, 60) || null,
        groupId: stringField(input.groupId, 60) || null,
        createdBy: viewer.id,
      })
      .returning({ id: tasks.id });
    await db.insert(taskAssignees).values(valid.map((row) => ({ taskId: inserted[0].id, userId: row.id })));
    await db.insert(taskActivity).values({ taskId: inserted[0].id, actorId: viewer.id, action: "created", detail: title });
    await notifyUsers({
      userIds: valid.map((row) => row.id).filter((id) => id !== viewer.id),
      kind: "group",
      title: `${viewer.displayName} assigned you a task`,
      body: `${priority} · ${title}`,
      href: `/tasks/${inserted[0].id}`,
    });
    await audit({ actorId: viewer.id, action: "task.create", targetType: "task", targetId: inserted[0].id, detail: title });
    return Response.json({ ok: true, id: inserted[0].id });
  }

  if (!taskId) return fail("task_required", 422);
  if (!isUuid(taskId)) return fail("invalid_id", 422);
  const rows = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  const task = rows[0];
  if (!task) return fail("not_found", 404);
  const assignees = await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  const isAssignee = assignees.some((row) => row.userId === viewer.id);
  const canManage = task.createdBy === viewer.id || moderator;

  if (action === "update") {
    if (!canManage) return fail("forbidden", 403);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof input.title === "string") {
      const title = stringField(input.title, 100);
      if (title.length < 3) return fail("invalid_title", 422);
      patch.title = title;
    }
    if (typeof input.description === "string") patch.description = stringField(input.description, 2000);
    if (typeof input.priority === "string" && PRIORITIES.includes(input.priority)) patch.priority = input.priority;
    if (typeof input.deadline === "string") patch.deadline = input.deadline ? new Date(input.deadline) : null;
    if (typeof input.projectId === "string") patch.projectId = input.projectId || null;
    if (typeof input.groupId === "string") patch.groupId = input.groupId || null;
    await db.update(tasks).set(patch).where(eq(tasks.id, taskId));
    if (Array.isArray(input.assigneeIds)) {
      const ids = input.assigneeIds.filter((value): value is string => typeof value === "string");
      if (ids.length) {
        await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
        await db.insert(taskAssignees).values(ids.map((userId) => ({ taskId, userId })));
      }
    }
    await db.insert(taskActivity).values({ taskId, actorId: viewer.id, action: "updated", detail: stringField(input.reason, 120) || null });
    await audit({ actorId: viewer.id, action: "task.update", targetType: "task", targetId: taskId });
    return Response.json({ ok: true });
  }

  if (action === "status") {
    if (!isAssignee && !canManage) return fail("forbidden", 403);
    const status = STATUSES.includes(stringField(input.status, 20)) ? stringField(input.status, 20) : null;
    if (!status) return fail("invalid_status", 422);
    await db
      .update(tasks)
      .set({
        status,
        completedAt: status === "COMPLETED" ? new Date() : null,
        progress: status === "COMPLETED" ? 100 : task.progress,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    await db.update(taskAssignees).set({ status }).where(eq(taskAssignees.taskId, taskId));
    if (status === "COMPLETED") await db.update(taskAssignees).set({ progress: 100 }).where(eq(taskAssignees.taskId, taskId));
    await db.insert(taskActivity).values({ taskId, actorId: viewer.id, action: "status", detail: status });
    await notifyUsers({
      userIds: [task.createdBy ?? "", ...assignees.map((row) => row.userId)].filter((id) => id && id !== viewer.id),
      kind: "group",
      title: `Task ${status === "COMPLETED" ? "completed" : status === "IN_PROGRESS" ? "in progress" : "reopened"}`,
      body: task.title,
      href: `/tasks/${taskId}`,
    });
    return Response.json({ ok: true });
  }

  if (action === "progress") {
    if (!isAssignee) return fail("forbidden", 403);
    const progress = Math.min(Math.max(Number(input.progress ?? 0), 0), 100);
    await db.update(tasks).set({ progress, updatedAt: new Date() }).where(eq(tasks.id, taskId));
    await db.update(taskAssignees).set({ progress }).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, viewer.id)));
    await db.insert(taskActivity).values({ taskId, actorId: viewer.id, action: "progress", detail: `${progress}%` });
    return Response.json({ ok: true, progress });
  }

  if (action === "comment") {
    const text = stringField(input.body, 1000);
    const mediaId = stringField(input.mediaId, 60) || null;
    if (!text && !mediaId) return fail("comment_required", 422);
    const inserted = await db.insert(taskComments).values({ taskId, authorId: viewer.id, body: text, mediaId }).returning({ id: taskComments.id });
    await db.insert(taskActivity).values({ taskId, actorId: viewer.id, action: "comment", detail: text.slice(0, 120) });
    await notifyUsers({
      userIds: [task.createdBy ?? "", ...assignees.map((row) => row.userId)].filter((id) => id && id !== viewer.id),
      kind: "reply",
      title: `${viewer.displayName} commented on a task`,
      body: text.slice(0, 160) || "Attachment",
      href: `/tasks/${taskId}`,
    });
    return Response.json({ ok: true, id: inserted[0].id });
  }

  if (action === "edit-comment") {
    const commentId = stringField(input.commentId, 60);
    const text = stringField(input.body, 1000);
    const comment = await db.select().from(taskComments).where(eq(taskComments.id, commentId)).limit(1);
    if (!comment[0]) return fail("not_found", 404);
    if (comment[0].authorId !== viewer.id) return fail("forbidden", 403);
    await db.update(taskComments).set({ body: text }).where(eq(taskComments.id, commentId));
    return Response.json({ ok: true });
  }

  if (action === "delete-comment") {
    const commentId = stringField(input.commentId, 60);
    const comment = await db.select().from(taskComments).where(eq(taskComments.id, commentId)).limit(1);
    if (!comment[0]) return fail("not_found", 404);
    if (comment[0].authorId !== viewer.id && !moderator) return fail("forbidden", 403);
    await db.update(taskComments).set({ deletedAt: new Date(), body: "" }).where(eq(taskComments.id, commentId));
    return Response.json({ ok: true });
  }

  return fail("unknown_action", 400);
}

export const _unusedTasks = { gt, lt, projectMembers };
