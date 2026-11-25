import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Stores a real browser push subscription. Delivery needs VAPID keys + a sender worker. */
export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 20);
  if (action === "unsubscribe") {
    const endpoint = stringField(input.endpoint, 500);
    if (endpoint) {
      await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, viewer.id), eq(pushSubscriptions.endpoint, endpoint)));
    } else {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, viewer.id));
    }
    return Response.json({ ok: true });
  }
  const endpoint = stringField(input.endpoint, 500);
  const p256dh = stringField(input.p256dh, 300);
  const auth = stringField(input.auth, 300);
  if (!endpoint || !p256dh || !auth) return fail("subscription_invalid", 422);
  await db
    .insert(pushSubscriptions)
    .values({ userId: viewer.id, endpoint, p256dh, auth, userAgent: request.headers.get("user-agent") })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: viewer.id, p256dh, auth, lastSeenAt: new Date() } });
  return Response.json({ ok: true, deliveryConfigured: Boolean(process.env.VAPID_PRIVATE_KEY) });
}
