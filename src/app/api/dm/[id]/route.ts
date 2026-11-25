import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { directConversationMembers } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail } from "@/lib/http";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const { id } = await ctx.params;
  const input = await body<{ pinned?: boolean; favorite?: boolean }>(request);

  const set: { pinnedAt?: Date | null; favoritedAt?: Date | null } = {};
  if (typeof input.pinned === "boolean") set.pinnedAt = input.pinned ? new Date() : null;
  if (typeof input.favorite === "boolean") set.favoritedAt = input.favorite ? new Date() : null;
  if (!Object.keys(set).length) return fail("nothing_to_update", 422);

  const updated = await db
    .update(directConversationMembers)
    .set(set)
    .where(and(eq(directConversationMembers.conversationId, id), eq(directConversationMembers.userId, user.id)))
    .returning({ pinnedAt: directConversationMembers.pinnedAt, favoritedAt: directConversationMembers.favoritedAt });

  if (!updated.length) return fail("not_found", 404);
  return Response.json({
    pinned: Boolean(updated[0].pinnedAt),
    favorite: Boolean(updated[0].favoritedAt),
  });
}
