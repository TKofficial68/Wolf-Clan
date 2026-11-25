import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";

export async function getUserSettings(userId: string) {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db.insert(userSettings).values({ userId }).returning();
  return inserted[0];
}
