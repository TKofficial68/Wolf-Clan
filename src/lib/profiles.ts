import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { profiles, userBlocks } from "@/db/schema";

export async function findProfileByUsername(username: string) {
  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      role: profiles.role,
      title: profiles.title,
      bio: profiles.bio,
      avatarUploadId: profiles.avatarUploadId,
      createdAt: profiles.createdAt,
      profileVisibility: profiles.profileVisibility,
    })
    .from(profiles)
    .where(eq(profiles.username, username.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function blockState(viewerId: string, targetId: string) {
  const rows = await db
    .select()
    .from(userBlocks)
    .where(
      or(
        eq(userBlocks.blockerId, viewerId),
        eq(userBlocks.blockerId, targetId),
      ),
    );
  const mine = rows.some((row) => row.blockerId === viewerId && row.blockedId === targetId);
  const theirs = rows.some((row) => row.blockerId === targetId && row.blockedId === viewerId);
  return { blockedByMe: mine, blockedMe: theirs };
}
