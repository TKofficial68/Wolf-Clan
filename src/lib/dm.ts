import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { directConversationMembers, directConversations, profiles, userBlocks } from "@/db/schema";

export type EnsureResult =
  | { ok: true; conversationId: string; created: boolean }
  | { ok: false; reason: "invalid_target" | "not_found" | "blocked_by_target" | "blocked_by_me" };

export async function ensureDirectConversation(viewerId: string, targetId: string): Promise<EnsureResult> {
  if (!targetId || targetId === viewerId) return { ok: false, reason: "invalid_target" };
  const target = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, targetId)).limit(1);
  if (!target.length) return { ok: false, reason: "not_found" };

  const blocks = await db
    .select()
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, targetId)),
        and(eq(userBlocks.blockerId, targetId), eq(userBlocks.blockedId, viewerId)),
      ),
    );
  if (blocks.some((block) => block.blockerId === targetId)) return { ok: false, reason: "blocked_by_target" };
  if (blocks.some((block) => block.blockerId === viewerId)) return { ok: false, reason: "blocked_by_me" };

  const mine = await db
    .select({ conversationId: directConversationMembers.conversationId })
    .from(directConversationMembers)
    .where(eq(directConversationMembers.userId, viewerId));
  if (mine.length) {
    const theirs = await db
      .select({ conversationId: directConversationMembers.conversationId })
      .from(directConversationMembers)
      .where(eq(directConversationMembers.userId, targetId));
    const shared = mine.find((row) => theirs.some((other) => other.conversationId === row.conversationId));
    if (shared) return { ok: true, conversationId: shared.conversationId, created: false };
  }

  const conversationId = await db.transaction(async (tx) => {
    const inserted = await tx.insert(directConversations).values({}).returning({ id: directConversations.id });
    const id = inserted[0].id;
    await tx.insert(directConversationMembers).values([
      { conversationId: id, userId: viewerId },
      { conversationId: id, userId: targetId },
    ]);
    return id;
  });
  return { ok: true, conversationId, created: true };
}
