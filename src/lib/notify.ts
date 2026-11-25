import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, userSettings } from "@/db/schema";

export type NotifyKind = "dm" | "group" | "mention" | "reply" | "reaction" | "review" | "announcement" | "moderation";

const SETTING_KEY: Record<NotifyKind, keyof typeof userSettings.$inferSelect> = {
  dm: "notifyMessages",
  group: "notifyGroups",
  mention: "notifyMentions",
  reply: "notifyReplies",
  reaction: "notifyReactions",
  review: "notifyReviews",
  announcement: "notifyAnnouncements",
  moderation: "notifyReviews",
};

export async function notifyUsers(input: {
  userIds: string[];
  kind: NotifyKind;
  title: string;
  body?: string;
  href?: string;
}): Promise<void> {
  const targets = Array.from(new Set(input.userIds));
  if (!targets.length) return;
  const settings = await db.select().from(userSettings).where(inArray(userSettings.userId, targets));
  const flag = SETTING_KEY[input.kind];
  const allowed = targets.filter((userId) => {
    const row = settings.find((s) => s.userId === userId);
    if (!row) return true;
    return Boolean(row[flag]);
  });
  if (!allowed.length) return;
  await db.insert(notifications).values(
    allowed.map((userId) => ({
      userId,
      kind: input.kind,
      title: input.title.slice(0, 120),
      body: input.body?.slice(0, 240) ?? null,
      href: input.href ?? null,
    })),
  );
}
