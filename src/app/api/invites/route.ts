import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { groupInvites, groupMembers, groups, joinRequests, profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { hasPermission } from "@/lib/perms";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const rows = await db.select().from(groupInvites).where(eq(groupInvites.code, code.trim())).limit(1);
    const invite = rows[0];
    if (!invite) return Response.json({ valid: false, reason: "not_found" });
    if (invite.revokedAt) return Response.json({ valid: false, reason: "revoked" });
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return Response.json({ valid: false, reason: "expired" });
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) return Response.json({ valid: false, reason: "used_up" });
    const group = invite.groupId ? await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, invite.groupId)).limit(1) : [];
    return Response.json({ valid: true, id: invite.id, approvalRequired: invite.approvalRequired, group: group[0] ?? null, uses: invite.uses, maxUses: invite.maxUses });
  }
  const canManage = viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "manage_members"));
  if (!canManage) return fail("forbidden", 403);
  const rows = await db
    .select({
      invite: groupInvites,
      groupName: groups.name,
      creatorName: profiles.displayName,
    })
    .from(groupInvites)
    .leftJoin(groups, eq(groups.id, groupInvites.groupId))
    .leftJoin(profiles, eq(profiles.id, groupInvites.createdBy))
    .orderBy(desc(groupInvites.createdAt))
    .limit(60);
  const requests = await db
    .select({ request: joinRequests, name: profiles.displayName, username: profiles.username })
    .from(joinRequests)
    .innerJoin(profiles, eq(profiles.id, joinRequests.userId))
    .where(eq(joinRequests.status, "PENDING"))
    .limit(50);
  return Response.json({
    invites: rows.map((row) => ({
      id: row.invite.id,
      code: row.invite.code,
      token: row.invite.token,
      groupId: row.invite.groupId,
      groupName: row.groupName,
      createdBy: row.creatorName,
      expiresAt: row.invite.expiresAt ? new Date(row.invite.expiresAt).toISOString() : null,
      maxUses: row.invite.maxUses,
      uses: row.invite.uses,
      approvalRequired: row.invite.approvalRequired,
      revokedAt: row.invite.revokedAt ? new Date(row.invite.revokedAt).toISOString() : null,
      createdAt: new Date(row.invite.createdAt).toISOString(),
    })),
    joinRequests: requests.map((row) => ({ id: row.request.id, name: row.name, username: row.username, inviteId: row.request.inviteId, createdAt: new Date(row.request.createdAt).toISOString() })),
  });
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 20);

  if (action === "join") {
    const code = stringField(input.code, 40);
    const rows = await db.select().from(groupInvites).where(eq(groupInvites.code, code)).limit(1);
    const invite = rows[0];
    if (!invite) return fail("not_found", 404);
    if (invite.revokedAt) return fail("revoked", 410);
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return fail("expired", 410);
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) return fail("used_up", 410);
    if (invite.approvalRequired) {
      await db.insert(joinRequests).values({ inviteId: invite.id, userId: viewer.id });
      const managers = await db.select({ id: profiles.id, role: profiles.role }).from(profiles);
      await notifyUsers({
        userIds: managers.filter((row) => row.role === "OWNER" || row.role === "ADMIN").map((row) => row.id),
        kind: "moderation",
        title: "Join request",
        body: `${viewer.displayName} asked to join`,
        href: "/owner/invites",
      });
      return Response.json({ ok: true, pending: true });
    }
    if (invite.groupId) {
      await db.insert(groupMembers).values({ groupId: invite.groupId, userId: viewer.id, groupRole: "MEMBER", addedBy: invite.createdBy }).onConflictDoNothing();
    }
    await db.update(groupInvites).set({ uses: invite.uses + 1 }).where(eq(groupInvites.id, invite.id));
    await audit({ actorId: viewer.id, action: "invite.join", targetType: "invite", targetId: invite.id });
    return Response.json({ ok: true, groupId: invite.groupId });
  }

  const canManage = viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "manage_members"));
  if (!canManage) return fail("forbidden", 403);

  if (action === "create") {
    const mode = ["link", "code", "both"].includes(stringField(input.mode, 10)) ? stringField(input.mode, 10) : "both";
    const expiry = stringField(input.expiry, 20);
    const hours = expiry === "1h" ? 1 : expiry === "6h" ? 6 : expiry === "1d" ? 24 : expiry === "7d" ? 168 : expiry === "30d" ? 720 : null;
    const maxUses = Number(input.maxUses ?? 0) > 0 ? Math.round(Number(input.maxUses)) : null;
    const code = randomBytes(4).toString("hex").toUpperCase();
    const token = randomBytes(18).toString("base64url");
    const inserted = await db
      .insert(groupInvites)
      .values({
        code: mode === "link" ? `${code}-${token.slice(0, 6)}` : code,
        token,
        groupId: stringField(input.groupId, 60) || null,
        createdBy: viewer.id,
        expiresAt: hours ? new Date(Date.now() + hours * 3600 * 1000) : null,
        maxUses,
        approvalRequired: input.approvalRequired === true,
      })
      .returning({ id: groupInvites.id, code: groupInvites.code, token: groupInvites.token });
    await audit({ actorId: viewer.id, action: "invite.create", targetType: "invite", targetId: inserted[0].id, detail: mode });
    return Response.json({ ok: true, code: inserted[0].code, token: inserted[0].token });
  }

  if (action === "revoke") {
    const id = stringField(input.inviteId, 60);
    await db.update(groupInvites).set({ revokedAt: new Date() }).where(eq(groupInvites.id, id));
    await audit({ actorId: viewer.id, action: "invite.revoke", targetType: "invite", targetId: id });
    return Response.json({ ok: true });
  }

  if (action === "decide") {
    const requestId = stringField(input.requestId, 60);
    const approve = input.approve === true;
    const rows = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId)).limit(1);
    const joinRequest = rows[0];
    if (!joinRequest) return fail("not_found", 404);
    await db.update(joinRequests).set({ status: approve ? "APPROVED" : "REJECTED", decidedBy: viewer.id, decidedAt: new Date() }).where(eq(joinRequests.id, requestId));
    if (approve && joinRequest.inviteId) {
      const invite = await db.select().from(groupInvites).where(eq(groupInvites.id, joinRequest.inviteId)).limit(1);
      if (invite[0]?.groupId) {
        await db.insert(groupMembers).values({ groupId: invite[0].groupId, userId: joinRequest.userId, groupRole: "MEMBER", addedBy: viewer.id }).onConflictDoNothing();
        await db.update(groupInvites).set({ uses: sql`${groupInvites.uses} + 1` }).where(eq(groupInvites.id, invite[0].id));
      }
    }
    await notifyUsers({ userIds: [joinRequest.userId], kind: "moderation", title: approve ? "Join request approved" : "Join request rejected", href: "/home" });
    await audit({ actorId: viewer.id, action: "invite.decide", targetType: "join_request", targetId: requestId, detail: approve ? "approved" : "rejected" });
    return Response.json({ ok: true });
  }

  return fail("unknown_action", 400);
}

export const _unusedInvites = { and, isNull, or };
