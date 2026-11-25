import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  announcementReads,
  announcements,
  deletionTombstones,
  directMessageHidden,
  directMessageReactions,
  directConversationMembers,
  directMessages,
  groupMembers,
  groupMessageReactions,
  groupMessageReads,
  groupMessages,
  groups,
  hardDeleteJobs,
  mediaExpiryQueue,
  meetingParticipants,
  meetings,
  notifications,
  projectActivity,
  projectMembers,
  profiles,
  projects,
  reports,
  reviewComments,
  reviewMedia,
  reviewReactions,
  reviewReads,
  reviews,
  taskActivity,
  taskAssignees,
  taskComments,
  taskReminders,
  tasks,
  uploads,
} from "@/db/schema";
import type { SessionUser } from "./auth";
import { canDeleteContent, hasPermission } from "./perms";
import { audit } from "./audit";

export type HardDeleteType =
  | "message"
  | "media"
  | "dm_all"
  | "group_all"
  | "group"
  | "review"
  | "review_media"
  | "task"
  | "project"
  | "announcement"
  | "task_comment"
  | "review_comment"
  | "meeting";

export type HardDeleteResult =
  | { ok: true; jobId: string; messages: number; files: number; bytes: number; progress: number }
  | { ok: false; error: string; status: number };

type Collector = { messageIds: string[]; mediaIds: string[]; uploadIds: string[]; bytes: number };

function empty(): Collector {
  return { messageIds: [], mediaIds: [], uploadIds: [], bytes: 0 };
}

async function addUploads(collector: Collector, ids: (string | null | undefined)[]) {
  const clean = ids.filter((id): id is string => Boolean(id));
  if (!clean.length) return;
  const rows = await db.select({ id: uploads.id, thumbId: uploads.thumbId, byteSize: uploads.byteSize }).from(uploads).where(or(inArray(uploads.id, clean), inArray(uploads.thumbId, clean)));
  for (const row of rows) {
    if (!collector.uploadIds.includes(row.id)) {
      collector.uploadIds.push(row.id);
      collector.bytes += row.byteSize;
    }
    if (row.thumbId && !collector.uploadIds.includes(row.thumbId)) collector.uploadIds.push(row.thumbId);
  }
}

async function clearUploads(collector: Collector) {
  for (let index = 0; index < collector.uploadIds.length; index += 500) {
    const batch = collector.uploadIds.slice(index, index + 500);
    await db.delete(mediaExpiryQueue).where(inArray(mediaExpiryQueue.mediaId, batch));
    await db.delete(uploads).where(inArray(uploads.id, batch));
  }
}

async function collectDmMessages(conversationId: string, onlyId?: string): Promise<{ ids: string[]; senderIds: Record<string, string> }> {
  const rows = await db
    .select({ id: directMessages.id, senderId: directMessages.senderId })
    .from(directMessages)
    .where(onlyId ? eq(directMessages.id, onlyId) : eq(directMessages.conversationId, conversationId));
  const senderIds: Record<string, string> = {};
  rows.forEach((row) => {
    senderIds[row.id] = row.senderId;
  });
  return { ids: rows.map((row) => row.id), senderIds };
}

export async function runHardDelete(
  viewer: SessionUser,
  input: { type: HardDeleteType; targetId: string; alsoTasks?: boolean; containerId?: string },
): Promise<HardDeleteResult> {
  const job = await db
    .insert(hardDeleteJobs)
    .values({ type: input.type, targetId: input.targetId, requestedBy: viewer.id, status: "RUNNING", progress: 5 })
    .returning({ id: hardDeleteJobs.id });
  const jobId = job[0].id;
  const collector = empty();
  let container: string | null = input.containerId ?? null;

  const finish = async (): Promise<HardDeleteResult> => {
    collector.mediaIds.forEach(() => undefined);
    await db
      .update(hardDeleteJobs)
      .set({ status: "DONE", progress: 100, fileCount: collector.uploadIds.length, freedBytes: collector.bytes, finishedAt: new Date() })
      .where(eq(hardDeleteJobs.id, jobId));
    await db.insert(deletionTombstones).values({ type: input.type, targetId: input.targetId, container });
    await audit({
      actorId: viewer.id,
      action: "hard_delete",
      targetType: input.type,
      targetId: input.targetId,
      detail: JSON.stringify({ jobId, messages: collector.messageIds.length, files: collector.uploadIds.length, bytes: collector.bytes }),
    });
    return {
      ok: true,
      jobId,
      messages: collector.messageIds.length,
      files: collector.uploadIds.length,
      bytes: collector.bytes,
      progress: 100,
    };
  };

  const refuse = async (error: string, status = 403): Promise<HardDeleteResult> => {
    await db.update(hardDeleteJobs).set({ status: "FAILED", error, finishedAt: new Date() }).where(eq(hardDeleteJobs.id, jobId));
    return { ok: false, error, status };
  };

  try {
    if (input.type === "message") {
      const rows = await db
        .select({ id: directMessages.id, senderId: directMessages.senderId, conversationId: directMessages.conversationId, mediaId: directMessages.mediaId })
        .from(directMessages)
        .where(eq(directMessages.id, input.targetId))
        .limit(1);
      if (rows[0]) {
        const message = rows[0];
        const author = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, message.senderId)).limit(1);
        const allowed = await canDeleteContent(viewer, { id: message.senderId, role: author[0]?.role ?? "MEMBER" });
        if (!allowed) return refuse("forbidden");
        container = `dm:${message.conversationId}`;
        await addUploads(collector, [message.mediaId]);
        await clearUploads(collector);
        await db.delete(directMessageReactions).where(eq(directMessageReactions.messageId, message.id));
        await db.delete(directMessageHidden).where(eq(directMessageHidden.messageId, message.id));
        await db.delete(directMessages).where(eq(directMessages.id, message.id));
        collector.messageIds.push(message.id);
        return await finish();
      }
      const groupRows = await db
        .select({ id: groupMessages.id, senderId: groupMessages.senderId, groupId: groupMessages.groupId, mediaId: groupMessages.mediaId })
        .from(groupMessages)
        .where(eq(groupMessages.id, input.targetId))
        .limit(1);
      if (!groupRows[0]) return refuse("not_found", 404);
      const message = groupRows[0];
      const author = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, message.senderId)).limit(1);
      const allowed = await canDeleteContent(viewer, { id: message.senderId, role: author[0]?.role ?? "MEMBER" });
      if (!allowed) return refuse("forbidden");
      container = `group:${message.groupId}`;
      await addUploads(collector, [message.mediaId]);
      await clearUploads(collector);
      await db.delete(groupMessageReactions).where(eq(groupMessageReactions.messageId, message.id));
      await db.delete(groupMessageReads).where(eq(groupMessageReads.messageId, message.id));
      await db.delete(groupMessages).where(eq(groupMessages.id, message.id));
      collector.messageIds.push(message.id);
      return await finish();
    }

    if (input.type === "media") {
      const upload = await db.select({ id: uploads.id, ownerId: uploads.ownerId, thumbId: uploads.thumbId }).from(uploads).where(eq(uploads.id, input.targetId)).limit(1);
      if (!upload[0]) return refuse("not_found", 404);
      const dmRef = await db.select({ id: directMessages.id, senderId: directMessages.senderId, conversationId: directMessages.conversationId }).from(directMessages).where(eq(directMessages.mediaId, input.targetId)).limit(1);
      const groupRef = await db.select({ id: groupMessages.id, senderId: groupMessages.senderId, groupId: groupMessages.groupId }).from(groupMessages).where(eq(groupMessages.mediaId, input.targetId)).limit(1);
      const reviewRef = await db.select({ id: reviewMedia.id, reviewId: reviewMedia.reviewId }).from(reviewMedia).where(eq(reviewMedia.mediaId, input.targetId)).limit(1);
      let owner = { id: upload[0].ownerId, role: "MEMBER" };
      if (dmRef[0]) {
        const author = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, dmRef[0].senderId)).limit(1);
        owner = { id: dmRef[0].senderId, role: author[0]?.role ?? "MEMBER" };
        container = `dm:${dmRef[0].conversationId}`;
      } else if (groupRef[0]) {
        const author = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, groupRef[0].senderId)).limit(1);
        owner = { id: groupRef[0].senderId, role: author[0]?.role ?? "MEMBER" };
        container = `group:${groupRef[0].groupId}`;
      } else if (reviewRef[0]) {
        const review = await db.select({ authorId: reviews.authorId }).from(reviews).where(eq(reviews.id, reviewRef[0].reviewId)).limit(1);
        if (review[0]) {
          const author = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, review[0].authorId)).limit(1);
          owner = { id: review[0].authorId, role: author[0]?.role ?? "MEMBER" };
        }
        container = `review:${reviewRef[0].reviewId}`;
      }
      if (!(await canDeleteContent(viewer, owner)) && !(await hasPermission(viewer, "manage_files"))) return refuse("forbidden");
      await addUploads(collector, [upload[0].id]);
      if (dmRef[0]) {
        await db.delete(directMessages).where(eq(directMessages.id, dmRef[0].id));
        collector.messageIds.push(dmRef[0].id);
      }
      if (groupRef[0]) {
        await db.delete(groupMessages).where(eq(groupMessages.id, groupRef[0].id));
        collector.messageIds.push(groupRef[0].id);
      }
      if (reviewRef[0]) await db.delete(reviewMedia).where(eq(reviewMedia.id, reviewRef[0].id));
      await clearUploads(collector);
      return await finish();
    }

    if (input.type === "dm_all" || input.type === "group_all") {
      if (viewer.role !== "OWNER") {
        const capability = viewer.role === "OWNER" || (await canDeleteContent(viewer, { id: "other", role: "MEMBER" }));
        if (!capability) return refuse("forbidden");
      }
      if (input.type === "dm_all") {
        const membership = await db
          .select({ userId: directConversationMembers.userId })
          .from(directConversationMembers)
          .where(and(eq(directConversationMembers.conversationId, input.targetId), eq(directConversationMembers.userId, viewer.id)))
          .limit(1);
        if (!membership[0] && viewer.role !== "OWNER") return refuse("not_a_member");
        container = `dm:${input.targetId}`;
        const rows = await db.select({ id: directMessages.id, mediaId: directMessages.mediaId }).from(directMessages).where(eq(directMessages.conversationId, input.targetId));
        collector.messageIds = rows.map((row) => row.id);
        for (const row of rows) await addUploads(collector, [row.mediaId]);
        await clearUploads(collector);
        if (collector.messageIds.length) {
          await db.delete(directMessageReactions).where(inArray(directMessageReactions.messageId, collector.messageIds));
          await db.delete(directMessageHidden).where(inArray(directMessageHidden.messageId, collector.messageIds));
          await db.delete(directMessages).where(eq(directMessages.conversationId, input.targetId));
        }
        return await finish();
      }
      container = `group:${input.targetId}`;
      const rows = await db.select({ id: groupMessages.id, mediaId: groupMessages.mediaId }).from(groupMessages).where(eq(groupMessages.groupId, input.targetId));
      collector.messageIds = rows.map((row) => row.id);
      for (const row of rows) await addUploads(collector, [row.mediaId]);
      await clearUploads(collector);
      if (collector.messageIds.length) {
        await db.delete(groupMessageReactions).where(inArray(groupMessageReactions.messageId, collector.messageIds));
        await db.delete(groupMessageReads).where(inArray(groupMessageReads.messageId, collector.messageIds));
        await db.delete(groupMessages).where(eq(groupMessages.groupId, input.targetId));
      }
      return await finish();
    }

    if (input.type === "group") {
      const group = await db.select().from(groups).where(eq(groups.id, input.targetId)).limit(1);
      if (!group[0]) return refuse("not_found", 404);
      const creatorAllowed = group[0].createdBy === viewer.id;
      const capability = await canDeleteContent(viewer, { id: group[0].createdBy ?? "", role: "MEMBER" });
      if (!creatorAllowed && !capability) return refuse("forbidden");
      container = `group:${input.targetId}`;
      const rows = await db.select({ id: groupMessages.id, mediaId: groupMessages.mediaId }).from(groupMessages).where(eq(groupMessages.groupId, input.targetId));
      collector.messageIds = rows.map((row) => row.id);
      for (const row of rows) await addUploads(collector, [row.mediaId]);
      await clearUploads(collector);
      if (collector.messageIds.length) {
        await db.delete(groupMessageReactions).where(inArray(groupMessageReactions.messageId, collector.messageIds));
        await db.delete(groupMessageReads).where(inArray(groupMessageReads.messageId, collector.messageIds));
      }
      const linked = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.groupId, input.targetId));
      if (input.alsoTasks && linked.length) {
        await db.delete(taskComments).where(inArray(taskComments.taskId, linked.map((row) => row.id)));
        await db.delete(taskAssignees).where(inArray(taskAssignees.taskId, linked.map((row) => row.id)));
        await db.delete(taskActivity).where(inArray(taskActivity.taskId, linked.map((row) => row.id)));
        await db.delete(taskReminders).where(inArray(taskReminders.taskId, linked.map((row) => row.id)));
        await db.delete(tasks).where(inArray(tasks.id, linked.map((row) => row.id)));
      } else {
        await db.update(tasks).set({ groupId: null }).where(eq(tasks.groupId, input.targetId));
      }
      await db.delete(meetings).where(eq(meetings.groupId, input.targetId));
      await db.delete(groupMessages).where(eq(groupMessages.groupId, input.targetId));
      await db.delete(groupMembers).where(eq(groupMembers.groupId, input.targetId));
      await db.delete(groups).where(eq(groups.id, input.targetId));
      return await finish();
    }

    if (input.type === "review") {
      const review = await db.select().from(reviews).where(eq(reviews.id, input.targetId)).limit(1);
      if (!review[0]) return refuse("not_found", 404);
      const author = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, review[0].authorId)).limit(1);
      if (!(await canDeleteContent(viewer, { id: review[0].authorId, role: author[0]?.role ?? "MEMBER" }))) return refuse("forbidden");
      container = `review:${input.targetId}`;
      const media = await db.select({ mediaId: reviewMedia.mediaId }).from(reviewMedia).where(eq(reviewMedia.reviewId, input.targetId));
      for (const row of media) await addUploads(collector, [row.mediaId]);
      await clearUploads(collector);
      await db.delete(reviewReactions).where(eq(reviewReactions.reviewId, input.targetId));
      await db.delete(reviewComments).where(eq(reviewComments.reviewId, input.targetId));
      await db.delete(reviewReads).where(eq(reviewReads.reviewId, input.targetId));
      await db.delete(reviewMedia).where(eq(reviewMedia.reviewId, input.targetId));
      await db.delete(reviews).where(eq(reviews.id, input.targetId));
      await db.update(reports).set({ snapshot: null, moderatorNote: "content deleted" }).where(and(eq(reports.targetType, "review"), eq(reports.targetId, input.targetId)));
      return await finish();
    }

    if (input.type === "task") {
      const task = await db.select().from(tasks).where(eq(tasks.id, input.targetId)).limit(1);
      if (!task[0]) return refuse("not_found", 404);
      if (!(await canDeleteContent(viewer, { id: task[0].createdBy ?? "", role: "MEMBER" }))) return refuse("forbidden");
      const attachments = await db.select({ mediaId: taskComments.mediaId }).from(taskComments).where(eq(taskComments.taskId, input.targetId));
      for (const row of attachments) await addUploads(collector, [row.mediaId]);
      await clearUploads(collector);
      await db.delete(taskComments).where(eq(taskComments.taskId, input.targetId));
      await db.delete(taskAssignees).where(eq(taskAssignees.taskId, input.targetId));
      await db.delete(taskActivity).where(eq(taskActivity.taskId, input.targetId));
      await db.delete(taskReminders).where(eq(taskReminders.taskId, input.targetId));
      await db.delete(tasks).where(eq(tasks.id, input.targetId));
      return await finish();
    }

    if (input.type === "project") {
      const project = await db.select().from(projects).where(eq(projects.id, input.targetId)).limit(1);
      if (!project[0]) return refuse("not_found", 404);
      if (!(await canDeleteContent(viewer, { id: project[0].createdBy ?? "", role: "MEMBER" }))) return refuse("forbidden");
      const linked = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, input.targetId));
      if (input.alsoTasks && linked.length) {
        const ids = linked.map((row) => row.id);
        const attachments = await db.select({ mediaId: taskComments.mediaId }).from(taskComments).where(inArray(taskComments.taskId, ids));
        for (const row of attachments) await addUploads(collector, [row.mediaId]);
        await clearUploads(collector);
        await db.delete(taskComments).where(inArray(taskComments.taskId, ids));
        await db.delete(taskAssignees).where(inArray(taskAssignees.taskId, ids));
        await db.delete(taskActivity).where(inArray(taskActivity.taskId, ids));
        await db.delete(taskReminders).where(inArray(taskReminders.taskId, ids));
        await db.delete(tasks).where(inArray(tasks.id, ids));
      } else {
        await db.update(tasks).set({ projectId: null }).where(eq(tasks.projectId, input.targetId));
      }
      await db.delete(projectMembers).where(eq(projectMembers.projectId, input.targetId));
      await db.delete(projectActivity).where(eq(projectActivity.projectId, input.targetId));
      await db.delete(projects).where(eq(projects.id, input.targetId));
      return await finish();
    }

    if (input.type === "announcement") {
      const rows = await db.select({ imageUploadId: announcements.imageUploadId }).from(announcements).where(eq(announcements.id, input.targetId)).limit(1);
      if (!rows[0]) return refuse("not_found", 404);
      await addUploads(collector, [rows[0].imageUploadId]);
      await clearUploads(collector);
      await db.delete(announcementReads).where(eq(announcementReads.announcementId, input.targetId));
      await db.delete(announcements).where(eq(announcements.id, input.targetId));
      return await finish();
    }

    if (input.type === "task_comment") {
      const rows = await db.select().from(taskComments).where(eq(taskComments.id, input.targetId)).limit(1);
      if (!rows[0]) return refuse("not_found", 404);
      if (!(await canDeleteContent(viewer, { id: rows[0].authorId, role: "MEMBER" }))) return refuse("forbidden");
      await addUploads(collector, [rows[0].mediaId]);
      await clearUploads(collector);
      await db.delete(taskComments).where(eq(taskComments.id, input.targetId));
      return await finish();
    }

    if (input.type === "review_comment") {
      const rows = await db.select().from(reviewComments).where(eq(reviewComments.id, input.targetId)).limit(1);
      if (!rows[0]) return refuse("not_found", 404);
      if (!(await canDeleteContent(viewer, { id: rows[0].authorId, role: "MEMBER" }))) return refuse("forbidden");
      await db.delete(reviewComments).where(eq(reviewComments.parentId, input.targetId));
      await db.delete(reviewComments).where(eq(reviewComments.id, input.targetId));
      return await finish();
    }

    if (input.type === "meeting") {
      const rows = await db.select().from(meetings).where(eq(meetings.id, input.targetId)).limit(1);
      if (!rows[0]) return refuse("not_found", 404);
      if (!(await canDeleteContent(viewer, { id: rows[0].hostId, role: "MEMBER" }))) return refuse("forbidden");
      await db.delete(meetingParticipants).where(eq(meetingParticipants.meetingId, input.targetId));
      await db.delete(meetings).where(eq(meetings.id, input.targetId));
      return await finish();
    }

    return refuse("unknown_type", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "delete failed";
    await db.update(hardDeleteJobs).set({ status: "FAILED", error: message.slice(0, 300) }).where(eq(hardDeleteJobs.id, jobId));
    return { ok: false, error: "delete_failed", status: 500 };
  }
}

export async function tombstonesSince(since: Date | null) {
  const rows = await db
    .select()
    .from(deletionTombstones)
    .where(since ? sql`${deletionTombstones.deletedAt} > ${since}` : sql`true`)
    .orderBy(sql`${deletionTombstones.deletedAt} desc`)
    .limit(500);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    targetId: row.targetId,
    container: row.container,
    deletedAt: new Date(row.deletedAt).toISOString(),
  }));
}

export async function pruneTombstones(): Promise<number> {
  const removed = await db
    .delete(deletionTombstones)
    .where(sql`${deletionTombstones.deletedAt} < now() - interval '30 days'`)
    .returning({ id: deletionTombstones.id });
  return removed.length;
}

export async function countContent(type: HardDeleteType, targetId: string): Promise<{ messages: number; files: number; bytes: number } | null> {
  if (type === "message") {
    const dm = await db.select({ mediaId: directMessages.mediaId }).from(directMessages).where(eq(directMessages.id, targetId)).limit(1);
    if (dm[0]) {
      const media = await loadBytes([dm[0].mediaId]);
      return { messages: 1, files: media.files, bytes: media.bytes };
    }
    const group = await db.select({ mediaId: groupMessages.mediaId }).from(groupMessages).where(eq(groupMessages.id, targetId)).limit(1);
    if (!group[0]) return null;
    const media = await loadBytes([group[0].mediaId]);
    return { messages: 1, files: media.files, bytes: media.bytes };
  }
  if (type === "group_all") {
    const rows = await db.select({ mediaId: groupMessages.mediaId }).from(groupMessages).where(eq(groupMessages.groupId, targetId));
    const media = await loadBytes(rows.map((row) => row.mediaId));
    return { messages: rows.length, files: media.files, bytes: media.bytes };
  }
  if (type === "dm_all") {
    const rows = await db.select({ mediaId: directMessages.mediaId }).from(directMessages).where(eq(directMessages.conversationId, targetId));
    const media = await loadBytes(rows.map((row) => row.mediaId));
    return { messages: rows.length, files: media.files, bytes: media.bytes };
  }
  if (type === "group") {
    const rows = await db.select({ mediaId: groupMessages.mediaId }).from(groupMessages).where(eq(groupMessages.groupId, targetId));
    const media = await loadBytes(rows.map((row) => row.mediaId));
    return { messages: rows.length, files: media.files, bytes: media.bytes };
  }
  if (type === "review") {
    const rows = await db.select({ mediaId: reviewMedia.mediaId }).from(reviewMedia).where(eq(reviewMedia.reviewId, targetId));
    const media = await loadBytes(rows.map((row) => row.mediaId));
    return { messages: 0, files: media.files, bytes: media.bytes };
  }
  if (type === "task") {
    const rows = await db.select({ mediaId: taskComments.mediaId }).from(taskComments).where(eq(taskComments.taskId, targetId));
    const media = await loadBytes(rows.map((row) => row.mediaId));
    return { messages: 0, files: media.files, bytes: media.bytes };
  }
  if (type === "project") {
    const tasksRows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, targetId));
    if (!tasksRows.length) return { messages: 0, files: 0, bytes: 0 };
    const rows = await db.select({ mediaId: taskComments.mediaId }).from(taskComments).where(inArray(taskComments.taskId, tasksRows.map((row) => row.id)));
    const media = await loadBytes(rows.map((row) => row.mediaId));
    return { messages: 0, files: media.files, bytes: media.bytes };
  }
  if (type === "media") {
    const media = await loadBytes([targetId]);
    return { messages: 0, files: media.files, bytes: media.bytes };
  }
  if (type === "announcement") {
    const rows = await db.select({ imageUploadId: announcements.imageUploadId }).from(announcements).where(eq(announcements.id, targetId)).limit(1);
    const media = await loadBytes([rows[0]?.imageUploadId ?? null]);
    return { messages: 0, files: media.files, bytes: media.bytes };
  }
  return { messages: 0, files: 0, bytes: 0 };
}

async function loadBytes(ids: (string | null)[]) {
  const clean = ids.filter((id): id is string => Boolean(id));
  if (!clean.length) return { files: 0, bytes: 0 };
  const rows = await db.select({ id: uploads.id, thumbId: uploads.thumbId, byteSize: uploads.byteSize }).from(uploads).where(inArray(uploads.id, clean));
  const bytes = rows.reduce((total, row) => total + row.byteSize, 0);
  const thumbs = rows.filter((row) => row.thumbId).length;
  return { files: rows.length + thumbs, bytes };
}

export const _unusedHardDelete = { isNull, or };
