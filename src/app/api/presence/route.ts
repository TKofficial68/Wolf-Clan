import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, userPresence } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail } from "@/lib/http";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Unauthorized", 401);
  const input = await body<{ status?: string }>(request);
  const status = input.status === "offline" ? "offline" : "online";
  const now = new Date();
  await db
    .insert(userPresence)
    .values({ userId: user.id, status, lastSeenAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userPresence.userId,
      set: { status, lastSeenAt: now, updatedAt: now },
    });
  if (status === "offline") {
    await db.update(profiles).set({ lastSeenAt: now }).where(eq(profiles.id, user.id));
  }
  return Response.json({ ok: true, status });
}
