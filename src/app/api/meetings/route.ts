import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { groupMembers, meetingParticipants, meetings, meetingSessions, profiles, screenShareClaims } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { hasPermission, hasAnyPermission } from "@/lib/perms";
import { meetingsConfigured } from "@/lib/env";
import { avatarUrl } from "@/lib/home-data";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";

export const dynamic = "force-dynamic";

const MAX_SCREENS = 2;

async function meetingAccess(meetingId: string, viewerId: string, role: string) {
  const rows = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  const meeting = rows[0];
  if (!meeting) return null;
  let allowed = meeting.hostId === viewerId || role === "OWNER" || role === "ADMIN";
  if (!allowed && meeting.groupId) {
    const member = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.groupId, meeting.groupId), eq(groupMembers.userId, viewerId))).limit(1);
    allowed = member.length > 0;
  }
  if (!allowed) {
    const participant = await db.select().from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.userId, viewerId))).limit(1);
    allowed = participant.length > 0;
  }
  const canHost = meeting.hostId === viewerId || role === "OWNER" || role === "ADMIN";
  return { meeting, allowed, canHost };
}

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const access = await meetingAccess(id, viewer.id, viewer.role);
    if (!access) return fail("not_found", 404);
    if (!access.allowed) return fail("forbidden", 403);
    const participantRows = await db
      .select({ userId: meetingParticipants.userId, joinedAt: meetingParticipants.joinedAt, leftAt: meetingParticipants.leftAt, name: profiles.displayName, role: profiles.role, avatar: profiles.avatarUploadId, title: profiles.title })
      .from(meetingParticipants)
      .innerJoin(profiles, eq(profiles.id, meetingParticipants.userId))
      .where(eq(meetingParticipants.meetingId, id));
    const host = await db.select({ name: profiles.displayName, avatar: profiles.avatarUploadId }).from(profiles).where(eq(profiles.id, access.meeting.hostId)).limit(1);
    const live = access.meeting.status === "LIVE" || (new Date(access.meeting.startsAt).getTime() < Date.now() && access.meeting.status !== "ENDED");
    return Response.json(
      {
        meeting: {
          id: access.meeting.id,
          title: access.meeting.title,
          description: access.meeting.description,
          startsAt: new Date(access.meeting.startsAt).toISOString(),
          endsAt: access.meeting.endsAt ? new Date(access.meeting.endsAt).toISOString() : null,
          status: access.meeting.status,
          locked: access.meeting.locked,
          inviteToken: access.meeting.inviteToken,
          groupId: access.meeting.groupId,
          live,
          host: { id: access.meeting.hostId, name: host[0]?.name ?? "Host", avatarUrl: avatarUrl(host[0]?.avatar) },
          participants: participantRows.filter((row) => !row.leftAt).map((row) => ({
            id: row.userId,
            displayName: row.name,
            role: row.role,
            title: row.title,
            avatarUrl: avatarUrl(row.avatar),
          })),
          canHost: access.canHost,
          maxScreens: access.meeting.maxScreens,
        },
        configured: meetingsConfigured(),
        canHost: access.canHost,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const hasFullAccess = viewer.role === "OWNER" || viewer.role === "ADMIN";
  const myGroups = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, viewer.id));
  const groupIds = myGroups.map((row) => row.groupId);
  const rows = await db
    .select({
      meeting: meetings,
      hostName: profiles.displayName,
      hostAvatar: profiles.avatarUploadId,
      participantCount: sql<number>`(select count(*)::int from meeting_participants p where p.meeting_id = ${meetings.id} and p.left_at is null)`,
    })
    .from(meetings)
    .innerJoin(profiles, eq(profiles.id, meetings.hostId))
    .where(
      hasFullAccess
        ? or(eq(meetings.hostId, viewer.id), isNull(meetings.groupId), ...(groupIds.length ? [inArray(meetings.groupId, groupIds)] : [sql`true`]))!
        : or(eq(meetings.hostId, viewer.id), isNull(meetings.groupId), ...(groupIds.length ? [inArray(meetings.groupId, groupIds)] : [sql`false`]))!,
    )
    .orderBy(desc(meetings.startsAt))
    .limit(60);
  const now = Date.now();
  const mapped = rows.map((row) => ({
    id: row.meeting.id,
    title: row.meeting.title,
    description: row.meeting.description,
    startsAt: new Date(row.meeting.startsAt).toISOString(),
    endsAt: row.meeting.endsAt ? new Date(row.meeting.endsAt).toISOString() : null,
    status: row.meeting.status,
    locked: row.meeting.locked,
    groupId: row.meeting.groupId,
    hostName: row.hostName,
    hostAvatarUrl: avatarUrl(row.hostAvatar),
    participantCount: Number(row.participantCount ?? 0),
    canHost: row.meeting.hostId === viewer.id || hasFullAccess,
  }));
  return Response.json(
    {
      configured: meetingsConfigured(),
      live: mapped.filter((row) => row.status === "LIVE" || (row.status === "SCHEDULED" && new Date(row.startsAt).getTime() <= now && (!row.endsAt || new Date(row.endsAt).getTime() > now))),
      upcoming: mapped.filter((row) => row.status === "SCHEDULED" && new Date(row.startsAt).getTime() > now),
      past: mapped.filter((row) => row.status === "ENDED" || row.status === "CANCELLED" || (row.endsAt ? new Date(row.endsAt).getTime() <= now : false) || (row.status === "SCHEDULED" && new Date(row.startsAt).getTime() < now - 3 * 3600 * 1000)),
      canCreate: hasFullAccess || (await hasPermission(viewer, "manage_meetings")),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 30);
  const meetingId = stringField(input.meetingId ?? input.id, 60);

  if (action === "create") {
    if (!(viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "manage_meetings")))) return fail("forbidden", 403);
    const title = stringField(input.title, 100);
    if (title.length < 3) return fail("invalid_title", 422);
    const startNow = input.startNow === true;
    const startsAt = startNow ? new Date() : new Date(stringField(input.startsAt, 40) || Date.now() + 3600 * 1000);
    if (Number.isNaN(startsAt.getTime())) return fail("invalid_time", 422);
    const duration = Math.min(Math.max(Number(input.durationMinutes ?? 60), 10), 480);
    const inserted = await db
      .insert(meetings)
      .values({
        title,
        description: stringField(input.description, 500),
        hostId: viewer.id,
        groupId: stringField(input.groupId, 60) || null,
        startsAt,
        endsAt: startNow ? null : new Date(startsAt.getTime() + duration * 60000),
        status: startNow ? "LIVE" : "SCHEDULED",
        roomName: `wolf-${randomBytes(6).toString("hex")}`,
        inviteToken: randomBytes(18).toString("base64url"),
      })
      .returning({ id: meetings.id, inviteToken: meetings.inviteToken });
    if (startNow) {
      await db.insert(meetingSessions).values({ meetingId: inserted[0].id });
      await db.insert(meetingParticipants).values({ meetingId: inserted[0].id, userId: viewer.id }).onConflictDoNothing();
    }
    const memberIds = Array.isArray(input.memberIds) ? input.memberIds.filter((value): value is string => typeof value === "string") : [];
    await notifyUsers({
      userIds: memberIds.filter((id) => id !== viewer.id),
      kind: "group",
      title: startNow ? `${viewer.displayName} started a meeting` : `Meeting scheduled: ${title}`,
      body: startNow ? title : new Date(startsAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }),
      href: `/meetings/${inserted[0].id}`,
    });
    await audit({ actorId: viewer.id, action: startNow ? "meeting.start" : "meeting.create", targetType: "meeting", targetId: inserted[0].id, detail: title });
    return Response.json({ ok: true, id: inserted[0].id, inviteToken: inserted[0].inviteToken });
  }

  if (action === "join") {
    const token = stringField(input.inviteToken, 60);
    const meetingRows = token
      ? await db.select().from(meetings).where(eq(meetings.inviteToken, token)).limit(1)
      : await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
    const meeting = meetingRows[0];
    if (!meeting) return fail("not_found", 404);
    if (meeting.status === "ENDED") return fail("meeting_ended", 410);
    if (meeting.locked && meeting.hostId !== viewer.id && viewer.role !== "OWNER" && viewer.role !== "ADMIN") return fail("meeting_locked", 403);
    const active = await db.select({ userId: meetingParticipants.userId }).from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, meeting.id), isNull(meetingParticipants.leftAt)));
    if (active.length >= 100) return fail("meeting_full", 409);
    await db
      .insert(meetingParticipants)
      .values({ meetingId: meeting.id, userId: viewer.id })
      .onConflictDoUpdate({ target: [meetingParticipants.meetingId, meetingParticipants.userId], set: { leftAt: null, joinedAt: new Date() } });
    if (meeting.status === "SCHEDULED") {
      await db.update(meetings).set({ status: "LIVE", startsAt: meeting.startsAt }).where(eq(meetings.id, meeting.id));
      await db.insert(meetingSessions).values({ meetingId: meeting.id });
    }
    return Response.json({ ok: true, meetingId: meeting.id });
  }

  const access = await meetingAccess(meetingId, viewer.id, viewer.role);
  if (!access) return fail("not_found", 404);
  if (!access.allowed) return fail("forbidden", 403);

  if (action === "leave") {
    await db.update(meetingParticipants).set({ leftAt: new Date() }).where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.userId, viewer.id)));
    await db.delete(screenShareClaims).where(and(eq(screenShareClaims.meetingId, meetingId), eq(screenShareClaims.userId, viewer.id)));
    return Response.json({ ok: true });
  }

  if (action === "claim-screen") {
    const claims = await db.select().from(screenShareClaims).where(eq(screenShareClaims.meetingId, meetingId));
    if (claims.some((row) => row.userId === viewer.id)) return Response.json({ ok: true, slots: claims.length });
    if (claims.length >= MAX_SCREENS) return fail("screen_limit", 409);
    await db.insert(screenShareClaims).values({ meetingId, userId: viewer.id });
    return Response.json({ ok: true, slots: claims.length + 1 });
  }

  if (action === "release-screen") {
    await db.delete(screenShareClaims).where(and(eq(screenShareClaims.meetingId, meetingId), eq(screenShareClaims.userId, viewer.id)));
    return Response.json({ ok: true });
  }

  if (action === "lock" || action === "end" || action === "mute-all" || action === "remove" || action === "cancel") {
    const hostByPermission =
      access.canHost ||
      (action === "mute-all" || action === "remove"
        ? await hasPermission(viewer, "mute_participant")
        : await hasAnyPermission(viewer, ["manage_meetings", "manage_screen_share"]));
    if (!hostByPermission) return fail("forbidden", 403);
    if (meetingsConfigured() && (action === "mute-all" || action === "remove" || action === "end" || action === "cancel")) {
      try {
        const { RoomServiceClient } = await import("livekit-server-sdk");
        const client = new RoomServiceClient(process.env.NEXT_PUBLIC_LIVEKIT_URL as string, process.env.LIVEKIT_API_KEY as string, process.env.LIVEKIT_API_SECRET as string);
        if (action === "mute-all") await client.mutePublishedTrack(access.meeting.roomName, "", "", false).catch(() => undefined);
        if (action === "end" || action === "cancel") await client.deleteRoom(access.meeting.roomName).catch(() => undefined);
        if (action === "remove") await client.removeParticipant(access.meeting.roomName, stringField(input.userId, 60)).catch(() => undefined);
      } catch (error) {
        console.warn("[meetings] room service call failed", error instanceof Error ? error.message : "unknown");
      }
    }
    if (action === "lock") {
      await db.update(meetings).set({ locked: input.locked === true }).where(eq(meetings.id, meetingId));
    }
    if (action === "end" || action === "cancel") {
      const session = await db.select().from(meetingSessions).where(and(eq(meetingSessions.meetingId, meetingId), isNull(meetingSessions.endedAt))).limit(1);
      const participants = await db.select({ userId: meetingParticipants.userId }).from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, meetingId), isNull(meetingParticipants.leftAt)));
      if (session[0]) {
        await db.update(meetingSessions).set({ endedAt: new Date(), peakParticipants: participants.length }).where(eq(meetingSessions.id, session[0].id));
      }
      await db.update(meetings).set({ status: action === "end" ? "ENDED" : "CANCELLED", endsAt: new Date() }).where(eq(meetings.id, meetingId));
      await db.update(meetingParticipants).set({ leftAt: new Date() }).where(and(eq(meetingParticipants.meetingId, meetingId), isNull(meetingParticipants.leftAt)));
      await db.delete(screenShareClaims).where(eq(screenShareClaims.meetingId, meetingId));
      await notifyUsers({ userIds: participants.map((row) => row.userId), kind: "group", title: `Meeting ${action === "end" ? "ended" : "cancelled"}`, body: access.meeting.title, href: "/meetings" });
    }
    if (action === "remove") {
      const userId = stringField(input.userId, 60);
      await db.update(meetingParticipants).set({ leftAt: new Date() }).where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.userId, userId)));
      await db.delete(screenShareClaims).where(and(eq(screenShareClaims.meetingId, meetingId), eq(screenShareClaims.userId, userId)));
      await notifyUsers({ userIds: [userId], kind: "group", title: "You were removed from a meeting", body: access.meeting.title, href: "/meetings" });
    }
    await audit({ actorId: viewer.id, action: `meeting.${action}`, targetType: "meeting", targetId: meetingId });
    return Response.json({ ok: true });
  }

  return fail("unknown_action", 400);
}

export const _unusedMeetings = { asc, gt, lt, sql };
