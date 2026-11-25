import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  bans,
  branding,
  cleanupJobs,
  groupMembers,
  groups,
  mediaExpiryQueue,
  ownerSettings,
  profiles,
  reports,
  sessions,
  uploads,
  userBlocks,
  userPresence,
  authAttempts,
  teamApprovals,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { CAPABILITIES, getCapabilities, ownerCount, setRolePermission, setUserPermission, userPermissionOverrides } from "@/lib/perms";
import { userPermissions } from "@/db/schema";
import { capabilityStatus, pushConfigured, meetingsConfigured, mailConfiguredEnv } from "@/lib/env";
import { runTempCleanup, storageStats } from "@/lib/cleanup";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import { avatarUrl } from "@/lib/home-data";

export const dynamic = "force-dynamic";

const SECTIONS = [
  "dashboard",
  "members",
  "admins",
  "permissions",
  "groups",
  "invites",
  "branding",
  "reviews",
  "reports",
  "bans",
  "security",
  "audit",
  "storage",
  "notifications",
  "system",
] as const;

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  if (viewer.role !== "OWNER") return fail("forbidden", 403);
  const url = new URL(request.url);
  const section = (url.searchParams.get("section") ?? "dashboard") as (typeof SECTIONS)[number];
  if (!SECTIONS.includes(section)) return fail("unknown_section", 404);

  if (section === "dashboard") {
    const [memberRows, onlineRows, groupRows, reportRows, expiryRows, lastJob] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(profiles),
      db.select({ total: sql<number>`count(*)::int` }).from(userPresence).where(and(eq(userPresence.status, "online"), sql`${userPresence.lastSeenAt} > now() - interval '90 seconds'`)),
      db.select({ total: sql<number>`count(*)::int` }).from(groups),
      db.select({ total: sql<number>`count(*)::int` }).from(reports).where(inArray(reports.status, ["OPEN", "REVIEWING"])),
      db.select({ total: sql<number>`count(*)::int` }).from(mediaExpiryQueue).where(sql`${mediaExpiryQueue.processedAt} is null`),
      db.select().from(cleanupJobs).orderBy(desc(cleanupJobs.startedAt)).limit(1),
    ]);
    const storage = await storageStats();
    return Response.json({
      counts: {
        members: memberRows[0]?.total ?? 0,
        online: onlineRows[0]?.total ?? 0,
        groups: groupRows[0]?.total ?? 0,
        pendingReports: reportRows[0]?.total ?? 0,
        pendingExpiry: expiryRows[0]?.total ?? 0,
        files: storage.files,
        bytes: storage.bytes,
        owners: await ownerCount(),
      },
      lastCleanup: lastJob[0]
        ? { kind: lastJob[0].kind, status: lastJob[0].status, startedAt: new Date(lastJob[0].startedAt).toISOString(), finishedAt: lastJob[0].finishedAt ? new Date(lastJob[0].finishedAt).toISOString() : null, counts: lastJob[0].counts, dryRun: lastJob[0].dryRun }
        : null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (section === "members" || section === "admins") {
    const roleFilter = url.searchParams.get("role");
    const search = (url.searchParams.get("q") ?? "").trim();
    const rows = await db
      .select({
        id: profiles.id,
        email: profiles.email,
        username: profiles.username,
        displayName: profiles.displayName,
        role: profiles.role,
        title: profiles.title,
        bannedAt: profiles.bannedAt,
        banReason: profiles.banReason,
        createdAt: profiles.createdAt,
        avatarUploadId: profiles.avatarUploadId,
        presenceStatus: userPresence.status,
        presenceSeen: userPresence.lastSeenAt,
      })
      .from(profiles)
      .leftJoin(userPresence, eq(userPresence.userId, profiles.id))
      .where(
        and(
          section === "admins" ? inArray(profiles.role, ["ADMIN", "OWNER"]) : sql`true`,
          roleFilter && ["OWNER", "ADMIN", "MEMBER"].includes(roleFilter) ? eq(profiles.role, roleFilter) : sql`true`,
          search ? sql`(${profiles.displayName} ilike ${`%${search}%`} or ${profiles.username} ilike ${`%${search}%`})` : sql`true`,
        ),
      )
      .orderBy(desc(profiles.createdAt))
      .limit(200);
    return Response.json({
      members: rows.map((row) => ({
        id: row.id,
        email: section === "members" ? row.email : null,
        username: row.username,
        displayName: row.displayName,
        role: row.role,
        title: row.title,
        banned: Boolean(row.bannedAt),
        banReason: row.banReason,
        online: row.presenceStatus === "online" && row.presenceSeen !== null && Date.now() - new Date(row.presenceSeen).getTime() < 90_000,
        avatarUrl: avatarUrl(row.avatarUploadId),
        createdAt: new Date(row.createdAt).toISOString(),
      })),
      owners: await ownerCount(),
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (section === "permissions") {
    const overrides = await db.select().from(userPermissions);
    return Response.json({ capabilities: CAPABILITIES, overrides, roleDefaults: { OWNER: CAPABILITIES, ADMIN: CAPABILITIES.filter((c) => c !== "hard_delete_any"), MEMBER: ["post_review", "create_task"] } }, { headers: { "Cache-Control": "no-store" } });
  }

  if (section === "groups") {
    const rows = await db
      .select({ group: groups, members: sql<number>`(select count(*)::int from group_members gm where gm.group_id = ${groups.id})` })
      .from(groups)
      .orderBy(groups.name);
    return Response.json({ groups: rows.map((row) => ({ id: row.group.id, name: row.group.name, slug: row.group.slug, accent: row.group.accent, icon: row.group.icon, postRestricted: row.group.postRestricted, members: Number(row.members) })) });
  }

  if (section === "branding") {
    const rows = await db.select().from(branding).limit(1);
    const row = rows[0];
    return Response.json({
      branding: {
        appName: row?.appName ?? "Wolf Clan",
        tagline: row?.tagline ?? "One team. One vision.",
        logoMediaId: row?.logoMediaId ?? null,
        bannerMediaId: row?.bannerMediaId ?? null,
        logoUrl: row?.logoMediaId ? `/api/media/${row.logoMediaId}` : null,
        bannerUrl: row?.bannerMediaId ? `/api/media/${row.bannerMediaId}` : null,
      },
    });
  }

  if (section === "reviews") {
    const rows = await db.select().from(ownerSettings).limit(1);
    return Response.json({ settings: { membersCanPostReviews: rows[0]?.membersCanPostReviews ?? true, reviewModeration: rows[0]?.reviewModeration ?? true } });
  }

  if (section === "reports") {
    const rows = await db
      .select({ report: reports, reporterName: profiles.displayName, reporterRole: profiles.role })
      .from(reports)
      .innerJoin(profiles, eq(profiles.id, reports.reporterId))
      .orderBy(desc(reports.createdAt))
      .limit(100);
    return Response.json({
      reports: rows.map((row) => ({
        id: row.report.id,
        targetType: row.report.targetType,
        targetId: row.report.targetId,
        reason: row.report.reason,
        detail: row.report.detail,
        status: row.report.status,
        note: row.report.moderatorNote,
        reporter: row.reporterName,
        createdAt: new Date(row.report.createdAt).toISOString(),
      })),
    });
  }

  if (section === "bans") {
    const rows = await db
      .select({ ban: bans, name: profiles.displayName, username: profiles.username, role: profiles.role })
      .from(bans)
      .innerJoin(profiles, eq(profiles.id, bans.userId))
      .orderBy(desc(bans.createdAt))
      .limit(100);
    return Response.json({
      bans: rows.map((row) => ({ id: row.ban.id, userId: row.ban.userId, name: row.name, username: row.username, role: row.role, reason: row.ban.reason, expiresAt: row.ban.expiresAt ? new Date(row.ban.expiresAt).toISOString() : null, createdAt: new Date(row.ban.createdAt).toISOString(), liftedAt: row.ban.liftedAt ? new Date(row.ban.liftedAt).toISOString() : null })),
    });
  }

  if (section === "security") {
    const [sessionRows, attempts, blocks] = await Promise.all([
      db
        .select({ id: sessions.id, userId: sessions.userId, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastUsedAt: sessions.lastUsedAt, revokedAt: sessions.revokedAt, name: profiles.displayName })
        .from(sessions)
        .innerJoin(profiles, eq(profiles.id, sessions.userId))
        .orderBy(desc(sessions.lastUsedAt))
        .limit(60),
      db.select({ kind: authAttempts.kind, key: authAttempts.key, createdAt: authAttempts.createdAt }).from(authAttempts).orderBy(desc(authAttempts.createdAt)).limit(50),
      db.select({ total: sql<number>`count(*)::int` }).from(userBlocks),
    ]);
    return Response.json({
      sessions: sessionRows.map((row) => ({ id: row.id, userId: row.userId, name: row.name, userAgent: row.userAgent, createdAt: new Date(row.createdAt).toISOString(), lastUsedAt: new Date(row.lastUsedAt).toISOString(), revoked: Boolean(row.revokedAt) })),
      failedAttempts: attempts.map((row) => ({ kind: row.kind, key: row.key.replace(/(.{3}).+(@.*)?/, "$1***"), createdAt: new Date(row.createdAt).toISOString() })),
      blocks: Number(blocks[0]?.total ?? 0),
    });
  }

  if (section === "audit") {
    const actor = url.searchParams.get("actor");
    const action = url.searchParams.get("action");
    const from = url.searchParams.get("from");
    const format = url.searchParams.get("format");
    const rows = await db
      .select({ log: auditLogs, actorName: profiles.displayName })
      .from(auditLogs)
      .leftJoin(profiles, eq(profiles.id, auditLogs.actorId))
      .where(
        and(
          actor ? eq(auditLogs.actorId, actor) : sql`true`,
          action ? sql`${auditLogs.action} ilike ${`%${action}%`}` : sql`true`,
          from ? sql`${auditLogs.createdAt} >= ${new Date(from)}` : sql`true`,
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(500);
    if (format === "csv") {
      const header = "id,actor,action,target_type,target_id,detail,created_at";
      const bodyCsv = rows
        .map((row) => [row.log.id, row.actorName ?? "", row.log.action, row.log.targetType ?? "", row.log.targetId ?? "", (row.log.detail ?? "").replace(/[",\n]/g, " "), new Date(row.log.createdAt).toISOString()].map((value) => `"${value}"`).join(","))
        .join("\n");
      return new Response(`${header}\n${bodyCsv}`, {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="wolf-clan-audit-log.csv"' },
      });
    }
    return Response.json({
      logs: rows.map((row) => ({ id: row.log.id, actorId: row.log.actorId, actorName: row.actorName, action: row.log.action, targetType: row.log.targetType, targetId: row.log.targetId, detail: row.log.detail, createdAt: new Date(row.log.createdAt).toISOString() })),
    });
  }

  if (section === "storage") {
    const storage = await storageStats();
    return Response.json({ ...storage, lastCleanup: storage.jobs[0] ?? null, nextCleanupHint: "18:00 UTC daily (midnight Asia/Dhaka)" }, { headers: { "Cache-Control": "no-store" } });
  }

  if (section === "invites") {
    const modeRows = await db.select({ registrationMode: ownerSettings.registrationMode }).from(ownerSettings).limit(1);
    const pending = await db
      .select({ userId: teamApprovals.userId, status: teamApprovals.status, requestedAt: teamApprovals.requestedAt, name: profiles.displayName, username: profiles.username })
      .from(teamApprovals)
      .innerJoin(profiles, eq(profiles.id, teamApprovals.userId))
      .orderBy(desc(teamApprovals.requestedAt))
      .limit(60);
    return Response.json({ registrationMode: modeRows[0]?.registrationMode ?? "open", approvals: pending.map((row) => ({ ...row, requestedAt: new Date(row.requestedAt).toISOString() })) });
  }

  if (section === "notifications") {
    const groupOptions = await db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(groups.name);
    const members = await db.select({ id: profiles.id, displayName: profiles.displayName }).from(profiles).where(eq(profiles.role, "MEMBER")).limit(100);
    return Response.json({ groups: groupOptions, members });
  }

  if (section === "system") {
    const dbOk = await db.select({ ok: sql<number>`1` }).from(profiles).limit(1).then(() => true).catch(() => false);
    const storage = await storageStats();
    return Response.json({
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
      checks: {
        database: dbOk,
        storage: true,
        realtime: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        cron: Boolean(process.env.CRON_SECRET || process.env.CLEANUP_WORKER_SECRET),
        push: pushConfigured(),
        meetings: meetingsConfigured(),
        email: mailConfiguredEnv(),
      },
      env: capabilityStatus(),
      lastCleanup: storage.jobs[0] ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  return fail("unknown_section", 404);
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  if (viewer.role !== "OWNER") return fail("forbidden", 403);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 40);

  if (action === "role") {
    const userId = stringField(input.userId, 60);
    const role = stringField(input.role, 10);
    if (!["ADMIN", "MEMBER"].includes(role)) return fail("invalid_role", 422);
    const target = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!target[0]) return fail("not_found", 404);
    if (target[0].role === "OWNER") return fail("owner_protected", 403);
    await db.update(profiles).set({ role, updatedAt: new Date() }).where(eq(profiles.id, userId));
    await notifyUsers({ userIds: [userId], kind: "group", title: `Your role is now ${role.toLowerCase()}`, href: "/profile" });
    await audit({ actorId: viewer.id, action: "member.role", targetType: "profile", targetId: userId, detail: role });
    return Response.json({ ok: true });
  }

  if (action === "title") {
    const userId = stringField(input.userId, 60);
    const title = stringField(input.title, 24);
    const target = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!target[0]) return fail("not_found", 404);
    await db.update(profiles).set({ title: title || null, updatedAt: new Date() }).where(eq(profiles.id, userId));
    await audit({ actorId: viewer.id, action: "member.title", targetType: "profile", targetId: userId, detail: title });
    return Response.json({ ok: true });
  }

  if (action === "ban" || action === "unban") {
    const userId = stringField(input.userId, 60);
    const target = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!target[0]) return fail("not_found", 404);
    if (target[0].role === "OWNER") return fail("owner_protected", 403);
    if (action === "ban") {
      const reason = stringField(input.reason, 300) || "No reason given";
      const hours = Number(input.hours ?? 0);
      const expiresAt = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000) : null;
      await db.update(profiles).set({ bannedAt: new Date(), banReason: reason }).where(eq(profiles.id, userId));
      await db.insert(bans).values({ userId, reason, expiresAt, bannedBy: viewer.id });
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
      await audit({ actorId: viewer.id, action: "member.ban", targetType: "profile", targetId: userId, detail: reason });
    } else {
      await db.update(profiles).set({ bannedAt: null, banReason: null }).where(eq(profiles.id, userId));
      await db.update(bans).set({ liftedAt: new Date() }).where(and(eq(bans.userId, userId), sql`${bans.liftedAt} is null`));
      await audit({ actorId: viewer.id, action: "member.unban", targetType: "profile", targetId: userId });
    }
    return Response.json({ ok: true });
  }

  if (action === "force-signout") {
    const userId = stringField(input.userId, 60);
    const target = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (target[0]?.role === "OWNER" && userId !== viewer.id) return fail("owner_protected", 403);
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
    await audit({ actorId: viewer.id, action: "security.force_signout", targetType: "profile", targetId: userId });
    return Response.json({ ok: true });
  }

  if (action === "permission-user") {
    const userId = stringField(input.userId, 60);
    const capability = stringField(input.capability, 40);
    if (!CAPABILITIES.includes(capability as never)) return fail("invalid_capability", 422);
    const target = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!target[0]) return fail("not_found", 404);
    if (target[0].role === "OWNER") return fail("owner_protected", 403);
    await setUserPermission(viewer.id, userId, capability as never, input.allowed !== false);
    await audit({ actorId: viewer.id, action: "permission.user", targetType: "profile", targetId: userId, detail: `${capability}:${input.allowed !== false}` });
    return Response.json({ ok: true });
  }

  if (action === "permission-role") {
    const role = stringField(input.role, 10);
    const capability = stringField(input.capability, 40);
    if (role !== "ADMIN" && role !== "MEMBER") return fail("invalid_role", 422);
    if (!CAPABILITIES.includes(capability as never)) return fail("invalid_capability", 422);
    await setRolePermission(role, capability as never, input.allowed !== false);
    await audit({ actorId: viewer.id, action: "permission.role", targetType: "role", targetId: role, detail: `${capability}:${input.allowed !== false}` });
    return Response.json({ ok: true });
  }

  if (action === "review-settings") {
    await db
      .update(ownerSettings)
      .set({ membersCanPostReviews: input.membersCanPostReviews !== false, reviewModeration: input.reviewModeration !== false, updatedAt: new Date() })
      .where(eq(ownerSettings.id, "singleton"));
    await audit({ actorId: viewer.id, action: "reviews.settings", detail: JSON.stringify({ members: input.membersCanPostReviews !== false, moderation: input.reviewModeration !== false }) });
    return Response.json({ ok: true });
  }

  if (action === "branding") {
    const logo = stringField(input.logoMediaId, 60) || null;
    const banner = stringField(input.bannerMediaId, 60) || null;
    const appName = stringField(input.appName, 40);
    const tagline = stringField(input.tagline, 80);
    const existing = await db.select().from(branding).limit(1);
    if (existing.length) {
      await db
        .update(branding)
        .set({
          appName: appName || existing[0].appName,
          tagline: tagline || existing[0].tagline,
          logoMediaId: input.reset === true ? null : (logo ?? existing[0].logoMediaId),
          bannerMediaId: input.reset === true ? null : (banner ?? existing[0].bannerMediaId),
          updatedAt: new Date(),
        })
        .where(eq(branding.id, "singleton"));
    } else {
      await db.insert(branding).values({ appName: appName || "Wolf Clan", tagline: tagline || "One team. One vision.", logoMediaId: logo, bannerMediaId: banner });
    }
    await audit({ actorId: viewer.id, action: "branding.update", detail: input.reset === true ? "reset" : "updated" });
    return Response.json({ ok: true });
  }

  if (action === "notify") {
    const audience = stringField(input.audience, 10);
    const title = stringField(input.title, 100);
    const message = stringField(input.body, 500);
    if (title.length < 3) return fail("invalid_title", 422);
    let targets: string[] = [];
    if (audience === "user") {
      const userId = stringField(input.userId, 60);
      if (!userId) return fail("member_required", 422);
      targets = [userId];
    } else if (audience === "group") {
      const groupId = stringField(input.groupId, 60);
      const rows = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
      targets = rows.map((row) => row.userId);
    } else {
      const rows = await db.select({ id: profiles.id }).from(profiles);
      targets = rows.map((row) => row.id);
    }
    await notifyUsers({ userIds: targets, kind: "moderation", title, body: message, href: "/notifications" });
    await audit({ actorId: viewer.id, action: "notify.send", targetType: "audience", targetId: audience, detail: title });
    return Response.json({ ok: true, sent: targets.length });
  }

  if (action === "cleanup-now") {
    if (stringField(input.confirm, 20) !== "CLEANUP") return fail("confirm_required", 422);
    const result = await runTempCleanup(input.dryRun === true);
    await audit({ actorId: viewer.id, action: "storage.cleanup", detail: JSON.stringify(result.counts) });
    return Response.json({ ok: true, result });
  }

  if (action === "registration-mode") {
    const mode = stringField(input.mode, 20);
    if (!["open", "invite_only", "open_approval"].includes(mode)) return fail("invalid_mode", 422);
    await db.update(ownerSettings).set({ registrationMode: mode, updatedAt: new Date() }).where(eq(ownerSettings.id, "singleton"));
    await audit({ actorId: viewer.id, action: "invites.registration_mode", targetType: "owner_settings", targetId: "singleton", detail: mode });
    return Response.json({ ok: true });
  }

  if (action === "approve-member") {
    const userId = stringField(input.userId, 60);
    const approve = input.approve !== false;
    if (!userId) return fail("member_required", 422);
    await db
      .update(teamApprovals)
      .set({ status: approve ? "APPROVED" : "REJECTED", decidedBy: viewer.id, decidedAt: new Date() })
      .where(eq(teamApprovals.userId, userId));
    if (!approve) await db.update(profiles).set({ bannedAt: new Date(), banReason: "Sign-up not approved" }).where(eq(profiles.id, userId));
    await notifyUsers({ userIds: [userId], kind: "moderation", title: approve ? "Your account is approved" : "Your sign-up was rejected", href: approve ? "/home" : "/blocked" });
    await audit({ actorId: viewer.id, action: approve ? "member.approve" : "member.reject", targetType: "profile", targetId: userId });
    return Response.json({ ok: true });
  }

  if (action === "report-status") {
    const reportId = stringField(input.reportId, 60);
    const status = stringField(input.status, 20);
    if (!["OPEN", "REVIEWING", "RESOLVED", "REJECTED"].includes(status)) return fail("invalid_status", 422);
    await db
      .update(reports)
      .set({ status, moderatorNote: stringField(input.note, 500) || null, resolvedBy: viewer.id, resolvedAt: status === "OPEN" ? null : new Date() })
      .where(eq(reports.id, reportId));
    await audit({ actorId: viewer.id, action: "report.status", targetType: "report", targetId: reportId, detail: status });
    return Response.json({ ok: true });
  }

  return fail("unknown_action", 400);
}

export const _unusedOwner = { getCapabilities, userPermissionOverrides, uploads, reports, cleanupJobs };
