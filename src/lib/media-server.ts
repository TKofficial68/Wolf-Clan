import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  directConversationMembers,
  directMessages,
  groupMembers,
  groupMessages,
  mediaExpiryQueue,
  profiles,
  reviewMedia,
  reviews,
  uploads,
} from "@/db/schema";
import type { MediaItem } from "./media-types";

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 50);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const VIDEO = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"];
const AUDIO = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/wav", "audio/webm", "audio/aac"];
const DOCS = [
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const BLOCKED_EXT = /\.(exe|bat|cmd|sh|ps1|msi|com|scr|js|mjs|jar|vbs|dll|apk|app)$/i;

export type MediaKind = "image" | "video" | "audio" | "voice" | "document";

export function kindFromMime(mime: string): MediaKind | null {
  if (IMAGE.includes(mime)) return "image";
  if (VIDEO.includes(mime)) return "video";
  if (AUDIO.includes(mime)) return "audio";
  if (DOCS.includes(mime)) return "document";
  return null;
}

export function isAllowedFile(name: string, mime: string): boolean {
  if (!name || BLOCKED_EXT.test(name)) return false;
  return kindFromMime(mime) !== null;
}

/** Each temporary file expires at the next midnight in Asia/Dhaka (UTC+6, no DST). */
export function nextMidnightDhaka(now = new Date()): Date {
  const dhaka = new Date(now.getTime() + 6 * 3600 * 1000);
  const next = Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate() + 1, 0, 0, 0);
  return new Date(next - 6 * 3600 * 1000);
}

export function mapMediaRow(row: {
  id: string;
  thumbId: string | null;
  kind: string;
  originalName: string | null;
  mime: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  expiresAt: Date | string | null;
  createdAt: Date | string;
}): MediaItem {
  const expires = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
  return {
    id: row.id,
    thumbId: row.thumbId,
    kind: row.kind,
    name: row.originalName ?? "file",
    mime: row.mime,
    size: row.byteSize,
    width: row.width,
    height: row.height,
    duration: row.duration,
    expired: expires !== null ? expires < Date.now() : false,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export async function loadMediaMap(ids: (string | null)[]): Promise<Map<string, MediaItem>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map();
  const rows = await db
    .select({
      id: uploads.id,
      thumbId: uploads.thumbId,
      kind: uploads.kind,
      originalName: uploads.originalName,
      mime: uploads.mime,
      byteSize: uploads.byteSize,
      width: uploads.width,
      height: uploads.height,
      duration: uploads.duration,
      expiresAt: uploads.expiresAt,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .where(inArray(uploads.id, unique));
  return new Map(rows.map((row) => [row.id, mapMediaRow(row)]));
}

export async function storeMedia(input: {
  ownerId: string;
  file: File;
  kind: MediaKind;
  name: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  permanent?: boolean;
  thumb?: File | null;
}): Promise<MediaItem> {
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const expiresAt = input.permanent ? null : nextMidnightDhaka();

  let thumbId: string | null = null;
  if (input.thumb) {
    const thumbBytes = Buffer.from(await input.thumb.arrayBuffer());
    const thumbRow = await db
      .insert(uploads)
      .values({
        ownerId: input.ownerId,
        mime: input.thumb.type || "image/jpeg",
        byteSize: thumbBytes.byteLength,
        data: thumbBytes,
        originalName: `thumb-${input.name}`,
        kind: "thumb",
        expiresAt,
      })
      .returning({ id: uploads.id });
    thumbId = thumbRow[0].id;
  }

  const inserted = await db
    .insert(uploads)
    .values({
      ownerId: input.ownerId,
      mime: input.file.type,
      byteSize: bytes.byteLength,
      data: bytes,
      originalName: input.name,
      kind: input.kind,
      width: input.width ?? null,
      height: input.height ?? null,
      duration: input.duration ?? null,
      thumbId,
      expiresAt,
    })
    .returning({
      id: uploads.id,
      thumbId: uploads.thumbId,
      kind: uploads.kind,
      originalName: uploads.originalName,
      mime: uploads.mime,
      byteSize: uploads.byteSize,
      width: uploads.width,
      height: uploads.height,
      duration: uploads.duration,
      expiresAt: uploads.expiresAt,
      createdAt: uploads.createdAt,
    });

  if (expiresAt) {
    await db.insert(mediaExpiryQueue).values({ mediaId: inserted[0].id, expiresAt });
  }
  return mapMediaRow(inserted[0]);
}

export async function canAccessMedia(userId: string, role: string, mediaId: string): Promise<boolean> {
  const rows = await db
    .select({ id: uploads.id, ownerId: uploads.ownerId, expiresAt: uploads.expiresAt })
    .from(uploads)
    .where(eq(uploads.id, mediaId))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (row.ownerId === userId) return true;
  if (!row.expiresAt) {
    const visible = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.id, userId), isNull(profiles.bannedAt)))
      .limit(1);
    return visible.length > 0;
  }
  const dmHit = await db
    .select({ id: directMessages.id })
    .from(directMessages)
    .innerJoin(
      directConversationMembers,
      and(
        eq(directConversationMembers.conversationId, directMessages.conversationId),
        eq(directConversationMembers.userId, userId),
      ),
    )
    .where(eq(directMessages.mediaId, mediaId))
    .limit(1);
  if (dmHit.length) return true;

  const groupHit = await db
    .select({ id: groupMessages.id })
    .from(groupMessages)
    .innerJoin(groupMembers, and(eq(groupMembers.groupId, groupMessages.groupId), eq(groupMembers.userId, userId)))
    .where(eq(groupMessages.mediaId, mediaId))
    .limit(1);
  if (groupHit.length) return true;

  const reviewHit = await db
    .select({ id: reviews.id, status: reviews.status, authorId: reviews.authorId })
    .from(reviewMedia)
    .innerJoin(reviews, eq(reviews.id, reviewMedia.reviewId))
    .where(eq(reviewMedia.mediaId, mediaId))
    .limit(1);
  if (reviewHit.length) {
    const review = reviewHit[0];
    return review.status === "APPROVED" || review.authorId === userId || role === "OWNER" || role === "ADMIN";
  }

  const thumbHit = await db.select({ id: uploads.id }).from(uploads).where(eq(uploads.thumbId, mediaId)).limit(1);
  return thumbHit.length > 0;
}

export async function mediaRow(mediaId: string) {
  const rows = await db
    .select({
      id: uploads.id,
      mime: uploads.mime,
      byteSize: uploads.byteSize,
      originalName: uploads.originalName,
      expiresAt: uploads.expiresAt,
      kind: uploads.kind,
    })
    .from(uploads)
    .where(eq(uploads.id, mediaId))
    .limit(1);
  return rows[0] ?? null;
}

export async function readMediaChunk(mediaId: string, start: number, length: number): Promise<Buffer> {
  const result = await db.execute(
    sql`select substring(data from ${start + 1} for ${length}) as chunk from uploads where id = ${mediaId}`,
  );
  const rows = result.rows as { chunk: Buffer | string | null }[];
  const value = rows[0]?.chunk;
  if (!value) return Buffer.alloc(0);
  return Buffer.isBuffer(value) ? value : Buffer.from(value, "binary");
}
