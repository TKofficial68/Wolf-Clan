import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, userSettings } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail } from "@/lib/http";

const BOOLEAN_FIELDS = [
  "pushEnabled",
  "notifyMessages",
  "notifyGroups",
  "notifyMentions",
  "notifyReplies",
  "notifyReactions",
  "notifyTasks",
  "notifyDeadlines",
  "notifyMeetings",
  "notifyAnnouncements",
  "notifyReviews",
  "sound",
  "vibration",
  "messagePreview",
  "quietHoursEnabled",
  "reduceMotion",
] as const;

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const update: Record<string, unknown> = { updatedAt: new Date() };

  for (const field of BOOLEAN_FIELDS) {
    if (typeof input[field] === "boolean") update[field] = input[field];
  }
  if (input.theme === "dark" || input.theme === "light" || input.theme === "system") update.theme = input.theme;
  if (input.language === "en" || input.language === "bn") update.language = input.language;
  if (input.animationLevel === "full" || input.animationLevel === "lite") update.animationLevel = input.animationLevel;
  if (typeof input.quietStart === "string" && /^\d{2}:\d{2}$/.test(input.quietStart)) update.quietStart = input.quietStart;
  if (typeof input.quietEnd === "string" && /^\d{2}:\d{2}$/.test(input.quietEnd)) update.quietEnd = input.quietEnd;

  await db
    .insert(userSettings)
    .values({ userId: user.id, ...update })
    .onConflictDoUpdate({ target: userSettings.userId, set: update });

  const privacy: Record<string, unknown> = {};
  if (input.onlineVisibility === "everyone" || input.onlineVisibility === "nobody") privacy.onlineVisibility = input.onlineVisibility;
  if (input.lastSeenVisibility === "everyone" || input.lastSeenVisibility === "nobody") privacy.lastSeenVisibility = input.lastSeenVisibility;
  if (input.profileVisibility === "everyone" || input.profileVisibility === "nobody") privacy.profileVisibility = input.profileVisibility;
  if (Object.keys(privacy).length) {
    await db.update(profiles).set(privacy).where(eq(profiles.id, user.id));
  }

  return Response.json({ ok: true });
}
