import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, meetingParticipants, meetings, profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/http";
import { meetingsConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Server-only: mints a short-lived LiveKit token with audio + screen-share grants and no camera. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  if (!meetingsConfigured()) {
    return Response.json({ configured: false, error: "livekit_not_configured" }, { status: 503 });
  }
  const { id } = await ctx.params;
  const rows = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
  const meeting = rows[0];
  if (!meeting) return fail("not_found", 404);
  if (meeting.status === "ENDED" || meeting.status === "CANCELLED") return fail("meeting_ended", 410);

  const profile = await db.select({ bannedAt: profiles.bannedAt }).from(profiles).where(eq(profiles.id, viewer.id)).limit(1);
  if (profile[0]?.bannedAt) return fail("banned", 403);

  const host = meeting.hostId === viewer.id || viewer.role === "OWNER" || viewer.role === "ADMIN";
  if (!host) {
    if (meeting.locked) return fail("meeting_locked", 403);
    let allowed = false;
    if (meeting.groupId) {
      const member = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.groupId, meeting.groupId), eq(groupMembers.userId, viewer.id))).limit(1);
      allowed = member.length > 0;
    }
    if (!allowed) {
      const invited = await db.select({ userId: meetingParticipants.userId }).from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, id), eq(meetingParticipants.userId, viewer.id))).limit(1);
      allowed = invited.length > 0;
    }
    if (!allowed) return fail("not_invited", 403);
  }

  const active = await db.select({ userId: meetingParticipants.userId }).from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, id), isNull(meetingParticipants.leftAt)));
  if (active.length >= 100 && !active.some((row) => row.userId === viewer.id)) return fail("meeting_full", 409);

  const { AccessToken } = await import("livekit-server-sdk");
  const token = new AccessToken(process.env.LIVEKIT_API_KEY as string, process.env.LIVEKIT_API_SECRET as string, {
    identity: viewer.id,
    name: viewer.displayName,
    ttl: "2h",
  });
  token.addGrant({
    room: meeting.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishSources: ["microphone", "screen_share", "screen_share_audio"] as never,
    roomAdmin: host,
    roomCreate: false,
  });
  const jwt = await token.toJwt();
  await db
    .insert(meetingParticipants)
    .values({ meetingId: id, userId: viewer.id })
    .onConflictDoUpdate({ target: [meetingParticipants.meetingId, meetingParticipants.userId], set: { leftAt: null } });
  await db.update(meetings).set({ status: "LIVE" }).where(eq(meetings.id, id));
  return Response.json({
    configured: true,
    token: jwt,
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    roomName: meeting.roomName,
    identity: viewer.id,
    displayName: viewer.displayName,
    canHost: host,
  });
}
