import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  cleanupJobs,
  directMessageReactions,
  directMessages,
  groupMessageReactions,
  groupMessageReads,
  groupMessages,
  hardDeleteJobs,
  mediaExpiryQueue,
  meetingParticipants,
  meetings,
  notifications,
  taskAssignees,
  taskReminders,
  tasks,
  uploads,
  userPresence,
} from "@/db/schema";
import { pruneTombstones } from "./hard-delete";
import { notifyUsers } from "./notify";

export type CleanupOutcome = { jobId: string; kind: string; dryRun: boolean; counts: Record<string, number>; note?: string };

async function startJob(kind: string, dryRun: boolean): Promise<string> {
  const rows = await db.insert(cleanupJobs).values({ kind, dryRun, status: "RUNNING" }).returning({ id: cleanupJobs.id });
  return rows[0].id;
}

async function endJob(jobId: string, status: "DONE" | "FAILED", counts: Record<string, number>, error?: string) {
  await db
    .update(cleanupJobs)
    .set({ status, finishedAt: new Date(), counts: JSON.stringify(counts), error: error?.slice(0, 300) ?? null })
    .where(eq(cleanupJobs.id, jobId));
}

/** Daily temporary-file purge. Avatars and branding rows have no expiry and are never touched. */
export async function runTempCleanup(dryRun = false): Promise<CleanupOutcome> {
  const jobId = await startJob("temp_files", dryRun);
  const counts = { expired: 0, files: 0, bytes: 0, skipped: 0 };
  try {
    const rows = await db
      .select({ id: uploads.id, thumbId: uploads.thumbId, byteSize: uploads.byteSize })
      .from(uploads)
      .where(and(sql`${uploads.expiresAt} is not null`, lt(uploads.expiresAt, new Date())))
      .limit(500);
    counts.expired = rows.length;
    const ids = rows.flatMap((row) => (row.thumbId ? [row.id, row.thumbId] : [row.id]));
    counts.files = ids.length;
    counts.bytes = rows.reduce((total, row) => total + row.byteSize, 0);
    if (!dryRun && ids.length) {
      const linked = await db.select({ id: uploads.id }).from(uploads).where(inArray(uploads.id, ids));
      const linkedIds = linked.map((row) => row.id);
      await db.delete(mediaExpiryQueue).where(inArray(mediaExpiryQueue.mediaId, linkedIds));
      await db.update(directMessages).set({ mediaId: null }).where(inArray(directMessages.mediaId, linkedIds));
      await db.update(groupMessages).set({ mediaId: null }).where(inArray(groupMessages.mediaId, linkedIds));
      await db.delete(uploads).where(inArray(uploads.id, linkedIds));
    } else if (dryRun) {
      counts.skipped = ids.length;
    }
    await endJob(jobId, "DONE", counts);
    return { jobId, kind: "temp_files", dryRun, counts };
  } catch (error) {
    await endJob(jobId, "FAILED", counts, error instanceof Error ? error.message : "failed");
    return { jobId, kind: "temp_files", dryRun, counts, note: "failed" };
  }
}

/** Monthly chat cleanup: messages and their files only. Groups, members, tasks, projects, reviews stay. */
export async function runMonthlyChatCleanup(dryRun = false): Promise<CleanupOutcome> {
  const jobId = await startJob("monthly_chat", dryRun);
  const counts = { dmMessages: 0, groupMessages: 0, files: 0, bytes: 0 };
  try {
    const dmRows = await db.select({ id: directMessages.id, mediaId: directMessages.mediaId }).from(directMessages).limit(5000);
    const groupRows = await db.select({ id: groupMessages.id, mediaId: groupMessages.mediaId }).from(groupMessages).limit(5000);
    counts.dmMessages = dmRows.length;
    counts.groupMessages = groupRows.length;
    const mediaIds = [...dmRows.map((row) => row.mediaId), ...groupRows.map((row) => row.mediaId)].filter((id): id is string => Boolean(id));
    if (mediaIds.length) {
      const files = await db.select({ id: uploads.id, byteSize: uploads.byteSize }).from(uploads).where(inArray(uploads.id, mediaIds));
      counts.files = files.length;
      counts.bytes = files.reduce((total, row) => total + row.byteSize, 0);
    }
    if (!dryRun) {
      const dmIds = dmRows.map((row) => row.id);
      const groupIds = groupRows.map((row) => row.id);
      if (dmIds.length) {
        await db.delete(directMessageReactions).where(inArray(directMessageReactions.messageId, dmIds));
        await db.delete(directMessages).where(inArray(directMessages.id, dmIds));
      }
      if (groupIds.length) {
        await db.delete(groupMessageReactions).where(inArray(groupMessageReactions.messageId, groupIds));
        await db.delete(groupMessageReads).where(inArray(groupMessageReads.messageId, groupIds));
        await db.delete(groupMessages).where(inArray(groupMessages.id, groupIds));
      }
      if (mediaIds.length) {
        await db.delete(mediaExpiryQueue).where(inArray(mediaExpiryQueue.mediaId, mediaIds));
        await db.delete(uploads).where(inArray(uploads.id, mediaIds));
      }
    }
    await endJob(jobId, "DONE", counts);
    return { jobId, kind: "monthly_chat", dryRun, counts };
  } catch (error) {
    await endJob(jobId, "FAILED", counts, error instanceof Error ? error.message : "failed");
    return { jobId, kind: "monthly_chat", dryRun, counts, note: "failed" };
  }
}

export async function runReminders(dryRun = false): Promise<CleanupOutcome> {
  const jobId = await startJob("reminders", dryRun);
  const counts = { task24h: 0, task1h: 0, overdue: 0, meeting15m: 0, meetingStart: 0 };
  try {
    const open = await db
      .select({ id: tasks.id, title: tasks.title, deadline: tasks.deadline, createdBy: tasks.createdBy })
      .from(tasks)
      .where(and(sql`${tasks.status} <> 'COMPLETED'`, sql`${tasks.deadline} is not null`))
      .limit(500);
    for (const task of open) {
      if (!task.deadline) continue;
      const diff = new Date(task.deadline).getTime() - Date.now();
      const assignees = await db.select({ userId: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, task.id));
      const kinds: { kind: string; match: boolean }[] = [
        { kind: "24h", match: diff <= 24 * 3600 * 1000 && diff > 3600 * 1000 },
        { kind: "1h", match: diff <= 3600 * 1000 && diff > 0 },
        { kind: "overdue", match: diff < 0 },
      ];
      for (const entry of kinds) {
        if (!entry.match) continue;
        for (const assignee of assignees) {
          const existing = await db
            .select({ taskId: taskReminders.taskId })
            .from(taskReminders)
            .where(and(eq(taskReminders.taskId, task.id), eq(taskReminders.userId, assignee.userId), eq(taskReminders.kind, entry.kind)))
            .limit(1);
          if (existing.length) continue;
          if (!dryRun) {
            await db.insert(taskReminders).values({ taskId: task.id, userId: assignee.userId, kind: entry.kind }).onConflictDoNothing();
            await notifyUsers({
              userIds: [assignee.userId],
              kind: "group",
              title: entry.kind === "overdue" ? "Task overdue" : `Task due in ${entry.kind}`,
              body: task.title,
              href: `/tasks/${task.id}`,
            });
          }
          if (entry.kind === "24h") counts.task24h += 1;
          if (entry.kind === "1h") counts.task1h += 1;
          if (entry.kind === "overdue") counts.overdue += 1;
        }
      }
    }
    const upcoming = await db
      .select({ id: meetings.id, title: meetings.title, startsAt: meetings.startsAt, hostId: meetings.hostId })
      .from(meetings)
      .where(and(eq(meetings.status, "SCHEDULED"), sql`${meetings.startsAt} between now() and now() + interval '30 minutes'`))
      .limit(50);
    for (const meeting of upcoming) {
      const diff = new Date(meeting.startsAt).getTime() - Date.now();
      const people = await db.select({ userId: meetingParticipants.userId }).from(meetingParticipants).where(eq(meetingParticipants.meetingId, meeting.id));
      const targets = Array.from(new Set([meeting.hostId, ...people.map((row) => row.userId)]));
      if (diff <= 15 * 60 * 1000 && diff > 0) {
        counts.meeting15m += 1;
        if (!dryRun) await notifyUsers({ userIds: targets, kind: "group", title: "Meeting starts in 15 minutes", body: meeting.title, href: `/meetings/${meeting.id}` });
      }
      if (diff <= 60 * 1000 && diff > -5 * 60 * 1000) {
        counts.meetingStart += 1;
        if (!dryRun) await notifyUsers({ userIds: targets, kind: "group", title: "Meeting is starting", body: meeting.title, href: `/meetings/${meeting.id}` });
      }
    }
    await endJob(jobId, "DONE", counts);
    return { jobId, kind: "reminders", dryRun, counts };
  } catch (error) {
    await endJob(jobId, "FAILED", counts, error instanceof Error ? error.message : "failed");
    return { jobId, kind: "reminders", dryRun, counts, note: "failed" };
  }
}

export async function runPresenceSweep(dryRun = false): Promise<CleanupOutcome> {
  const jobId = await startJob("presence", dryRun);
  const stale = await db
    .select({ userId: userPresence.userId })
    .from(userPresence)
    .where(and(eq(userPresence.status, "online"), lt(userPresence.lastSeenAt, new Date(Date.now() - 90_000))));
  if (!dryRun && stale.length) {
    await db
      .update(userPresence)
      .set({ status: "offline", updatedAt: new Date() })
      .where(inArray(userPresence.userId, stale.map((row) => row.userId)));
  }
  const counts = { markedOffline: stale.length };
  await endJob(jobId, "DONE", counts);
  return { jobId, kind: "presence", dryRun, counts };
}

export async function runTombstonePrune(dryRun = false): Promise<CleanupOutcome> {
  const jobId = await startJob("tombstones", dryRun);
  const removed = dryRun ? 0 : await pruneTombstones();
  const counts = { removed };
  await endJob(jobId, "DONE", counts);
  return { jobId, kind: "tombstones", dryRun, counts };
}

export async function runOrphanSweep(dryRun = false): Promise<CleanupOutcome> {
  const jobId = await startJob("orphans", dryRun);
  const counts = { orphanFiles: 0, bytes: 0 };
  try {
    const rows = await db
      .select({ id: uploads.id, byteSize: uploads.byteSize })
      .from(uploads)
      .where(
        and(
          isNull(uploads.expiresAt),
          lt(uploads.createdAt, new Date(Date.now() - 24 * 3600 * 1000)),
          sql`not exists (select 1 from profiles p where p.avatar_upload_id = ${uploads.id} or p.banner_upload_id = ${uploads.id})`,
          sql`not exists (select 1 from branding b where b.logo_media_id = ${uploads.id} or b.banner_media_id = ${uploads.id})`,
          sql`not exists (select 1 from group_messages gm where gm.media_id = ${uploads.id})`,
          sql`not exists (select 1 from direct_messages dm where dm.media_id = ${uploads.id})`,
          sql`not exists (select 1 from review_media rm where rm.media_id = ${uploads.id})`,
          sql`not exists (select 1 from task_comments tc where tc.media_id = ${uploads.id})`,
          sql`not exists (select 1 from uploads u2 where u2.thumb_id = ${uploads.id})`,
        ),
      )
      .limit(200);
    counts.orphanFiles = rows.length;
    counts.bytes = rows.reduce((total, row) => total + row.byteSize, 0);
    if (!dryRun && rows.length) await db.delete(uploads).where(inArray(uploads.id, rows.map((row) => row.id)));
    await endJob(jobId, "DONE", counts);
    return { jobId, kind: "orphans", dryRun, counts };
  } catch (error) {
    await endJob(jobId, "FAILED", counts, error instanceof Error ? error.message : "failed");
    return { jobId, kind: "orphans", dryRun, counts, note: "failed" };
  }
}

export async function retryHardDeleteJobs(): Promise<CleanupOutcome> {
  const jobId = await startJob("hard_delete_retry", false);
  const stuck = await db
    .select({ id: hardDeleteJobs.id })
    .from(hardDeleteJobs)
    .where(and(eq(hardDeleteJobs.status, "RUNNING"), lt(hardDeleteJobs.createdAt, new Date(Date.now() - 10 * 60 * 1000))))
    .limit(50);
  if (stuck.length) {
    await db.update(hardDeleteJobs).set({ status: "FAILED", error: "stale job re-queued" }).where(inArray(hardDeleteJobs.id, stuck.map((row) => row.id)));
  }
  const counts = { reQueued: stuck.length };
  await endJob(jobId, "DONE", counts);
  return { jobId, kind: "hard_delete_retry", dryRun: false, counts };
}

export async function storageStats() {
  const rows = await db.select({ total: sql<number>`coalesce(sum(${uploads.byteSize}),0)::bigint`, files: sql<number>`count(*)::int` }).from(uploads);
  const pending = await db.select({ total: sql<number>`count(*)::int` }).from(mediaExpiryQueue).where(isNull(mediaExpiryQueue.processedAt));
  const jobs = await db.select().from(cleanupJobs).orderBy(sql`${cleanupJobs.startedAt} desc`).limit(8);
  return {
    bytes: Number(rows[0]?.total ?? 0),
    files: Number(rows[0]?.files ?? 0),
    pendingExpiry: Number(pending[0]?.total ?? 0),
    jobs: jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      dryRun: job.dryRun,
      status: job.status,
      startedAt: new Date(job.startedAt).toISOString(),
      finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
      counts: job.counts,
      error: job.error,
    })),
  };
}

export async function notificationCounts() {
  const rows = await db
    .select({ kind: notifications.kind, total: sql<number>`count(*)::int` })
    .from(notifications)
    .groupBy(notifications.kind);
  return rows;
}
