import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/http";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return fail("Unauthorized", 401);
  if (!user.onboardingCompleted) {
    await db.update(profiles).set({ onboardingCompleted: true }).where(eq(profiles.id, user.id));
  }
  return Response.json({ ok: true });
}
