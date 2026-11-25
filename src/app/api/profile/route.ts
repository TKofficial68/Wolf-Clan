import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles, uploads } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, normalizeUsername, stringField, validUsername } from "@/lib/http";

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof input.displayName === "string") {
    const displayName = stringField(input.displayName, 40);
    if (displayName.length < 2 || displayName.length > 32) return fail("invalid_name", 422);
    update.displayName = displayName;
  }
  if (typeof input.username === "string") {
    const username = normalizeUsername(stringField(input.username, 30));
    if (!validUsername(username)) return fail("invalid_username", 422);
    const taken = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.username, username), sql`${profiles.id} <> ${user.id}`))
      .limit(1);
    if (taken.length) return fail("username_taken", 409);
    update.username = username;
  }
  if (typeof input.title === "string") {
    const title = stringField(input.title, 24);
    update.title = title || null;
  }
  if (typeof input.bio === "string") {
    const bio = stringField(input.bio, 200);
    update.bio = bio || null;
  }
  if (typeof input.avatarUploadId === "string" && input.avatarUploadId) {
    const owned = await db
      .select({ id: uploads.id })
      .from(uploads)
      .where(and(eq(uploads.id, input.avatarUploadId), eq(uploads.ownerId, user.id)))
      .limit(1);
    if (!owned.length) return fail("invalid_upload", 422);
    update.avatarUploadId = input.avatarUploadId;
  }
  let previousBanner: string | null = null;
  if (typeof input.bannerUploadId === "string" && input.bannerUploadId) {
    if (user.role !== "OWNER") return fail("forbidden", 403);
    const owned = await db
      .select({ id: uploads.id })
      .from(uploads)
      .where(and(eq(uploads.id, input.bannerUploadId), eq(uploads.ownerId, user.id)))
      .limit(1);
    if (!owned.length) return fail("invalid_upload", 422);
    previousBanner = user.bannerUploadId;
    update.bannerUploadId = input.bannerUploadId;
  }

  const updated = await db.update(profiles).set(update).where(eq(profiles.id, user.id)).returning({
    displayName: profiles.displayName,
    username: profiles.username,
    title: profiles.title,
    bio: profiles.bio,
    avatarUploadId: profiles.avatarUploadId,
    bannerUploadId: profiles.bannerUploadId,
  });

  if (typeof update.avatarUploadId === "string" && user.avatarUploadId && user.avatarUploadId !== update.avatarUploadId) {
    await db.delete(uploads).where(eq(uploads.id, user.avatarUploadId));
  }
  if (typeof update.bannerUploadId === "string" && previousBanner && previousBanner !== update.bannerUploadId) {
    await db.delete(uploads).where(eq(uploads.id, previousBanner));
  }

  return Response.json({ ok: true, profile: updated[0] });
}
