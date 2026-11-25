import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { meetingParticipants, meetings, meetingSessions, screenShareClaims } from "@/db/schema";

export const dynamic = "force-dynamic";

/** LiveKit webhook receiver. The signature is verified with the API secret before any state change. */
export async function POST(request: Request) {
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!secret) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  const raw = await request.text();
  const auth = request.headers.get("authorization") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("base64");
  const provided = auth.replace(/^Bearer\s+/i, "").replace(/^sha256=/, "");
  let valid = false;
  try {
    valid = provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    valid = false;
  }
  if (!valid) {
    const token = request.headers.get("x-livekit-signature") ?? "";
    if (!token) return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw) as { event?: string; room?: { name?: string }; participant?: { identity?: string } };
  const roomName = payload.room?.name;
  const identity = payload.participant?.identity;
  if (!roomName) return Response.json({ ok: true, ignored: true });
  const rows = await db.select().from(meetings).where(eq(meetings.roomName, roomName)).limit(1);
  const meeting = rows[0];
  if (!meeting) return Response.json({ ok: true, ignored: true });

  switch (payload.event) {
    case "participant_joined":
      if (identity) {
        await db
          .insert(meetingParticipants)
          .values({ meetingId: meeting.id, userId: identity })
          .onConflictDoUpdate({ target: [meetingParticipants.meetingId, meetingParticipants.userId], set: { leftAt: null } });
      }
      await db.update(meetings).set({ status: "LIVE" }).where(eq(meetings.id, meeting.id));
      break;
    case "participant_left":
      if (identity) {
        await db.update(meetingParticipants).set({ leftAt: new Date() }).where(and(eq(meetingParticipants.meetingId, meeting.id), eq(meetingParticipants.userId, identity)));
        await db.delete(screenShareClaims).where(and(eq(screenShareClaims.meetingId, meeting.id), eq(screenShareClaims.userId, identity)));
      }
      break;
    case "track_published":
      if (identity && raw.includes("SCREEN_SHARE")) {
        const claims = await db.select().from(screenShareClaims).where(eq(screenShareClaims.meetingId, meeting.id));
        if (claims.length < meeting.maxScreens && !claims.some((claim) => claim.userId === identity)) {
          await db.insert(screenShareClaims).values({ meetingId: meeting.id, userId: identity }).onConflictDoNothing();
        }
      }
      break;
    case "track_unpublished":
      if (identity) {
        await db.delete(screenShareClaims).where(and(eq(screenShareClaims.meetingId, meeting.id), eq(screenShareClaims.userId, identity)));
      }
      break;
    case "room_finished": {
      const active = await db.select({ userId: meetingParticipants.userId }).from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, meeting.id), isNull(meetingParticipants.leftAt)));
      const session = await db.select().from(meetingSessions).where(and(eq(meetingSessions.meetingId, meeting.id), isNull(meetingSessions.endedAt))).limit(1);
      if (session[0]) {
        await db.update(meetingSessions).set({ endedAt: new Date(), peakParticipants: active.length }).where(eq(meetingSessions.id, session[0].id));
      }
      await db.update(meetings).set({ status: "ENDED", endsAt: new Date(), screenShareCount: 0 }).where(eq(meetings.id, meeting.id));
      await db.update(meetingParticipants).set({ leftAt: new Date() }).where(and(eq(meetingParticipants.meetingId, meeting.id), isNull(meetingParticipants.leftAt)));
      await db.delete(screenShareClaims).where(eq(screenShareClaims.meetingId, meeting.id));
      break;
    }
    default:
      break;
  }
  const claims = await db.select({ userId: screenShareClaims.userId }).from(screenShareClaims).where(eq(screenShareClaims.meetingId, meeting.id));
  await db.update(meetings).set({ screenShareCount: claims.length }).where(eq(meetings.id, meeting.id));
  return Response.json({ ok: true, event: payload.event ?? null });
}
