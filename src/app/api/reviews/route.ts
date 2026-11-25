import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ownerSettings,
  profiles,
  reviewComments,
  reviewMedia,
  reviewReactions,
  reviewReads,
  reviews,
  uploads,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { loadMediaMap, mapMediaRow } from "@/lib/media-server";
import { avatarUrl } from "@/lib/home-data";
import { notifyUsers } from "@/lib/notify";
import type { MediaItem } from "@/lib/media-types";

export const dynamic = "force-dynamic";

export type ReviewAuthor = {
  id: string;
  displayName: string;
  username: string;
  role: string;
  title: string | null;
  avatarUrl: string | null;
};

export type ReviewCommentItem = {
  id: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  parentId: string | null;
  mine: boolean;
  canDelete: boolean;
  author: ReviewAuthor;
};

export type ReviewItem = {
  id: string;
  kind: string;
  game: string;
  title: string;
  description: string;
  status: string;
  pinned: boolean;
  createdAt: string;
  author: ReviewAuthor;
  media: MediaItem[];
  likeCount: number;
  dislikeCount: number;
  myReaction: string | null;
  commentCount: number;
  unread: boolean;
  mine: boolean;
};

export type ReviewDetail = ReviewItem & { comments: ReviewCommentItem[]; canModerate: boolean };

const GAMES = ["Free Fire", "Minecraft", "Roblox", "Other"];

async function settings() {
  const rows = await db.select().from(ownerSettings).limit(1);
  return rows[0] ?? { id: "singleton", membersCanPostReviews: true, reviewModeration: true, updatedAt: new Date() };
}

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const moderator = viewer.role === "OWNER" || viewer.role === "ADMIN";
  const config = await settings();

  if (id) {
    const rows = await db
      .select({
        review: reviews,
        authorId: profiles.id,
        authorName: profiles.displayName,
        authorUsername: profiles.username,
        authorRole: profiles.role,
        authorTitle: profiles.title,
        authorAvatar: profiles.avatarUploadId,
      })
      .from(reviews)
      .innerJoin(profiles, eq(profiles.id, reviews.authorId))
      .where(eq(reviews.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return fail("not_found", 404);
    const mine = row.review.authorId === viewer.id;
    if (row.review.status !== "APPROVED" && !mine && !moderator) return fail("forbidden", 403);

    const mediaRows = await db.select().from(reviewMedia).where(eq(reviewMedia.reviewId, id)).orderBy(asc(reviewMedia.position));
    const mediaMap = await loadMediaMap(mediaRows.map((item) => item.mediaId));
    const media: MediaItem[] = [];
    for (const item of mediaRows) {
      const mapped = mediaMap.get(item.mediaId);
      if (mapped) media.push({ ...mapped, senderName: row.authorName, senderId: row.authorId });
    }

    const reactions = await db.select().from(reviewReactions).where(eq(reviewReactions.reviewId, id));
    const comments = await db
      .select({
        comment: reviewComments,
        authorId: profiles.id,
        authorName: profiles.displayName,
        authorUsername: profiles.username,
        authorRole: profiles.role,
        authorTitle: profiles.title,
        authorAvatar: profiles.avatarUploadId,
      })
      .from(reviewComments)
      .innerJoin(profiles, eq(profiles.id, reviewComments.authorId))
      .where(eq(reviewComments.reviewId, id))
      .orderBy(asc(reviewComments.createdAt));

    await db.insert(reviewReads).values({ reviewId: id, userId: viewer.id }).onConflictDoNothing();

    const detail: ReviewDetail = {
      id: row.review.id,
      kind: row.review.kind,
      game: row.review.game,
      title: row.review.title,
      description: row.review.description,
      status: row.review.status,
      pinned: row.review.pinned,
      createdAt: new Date(row.review.createdAt).toISOString(),
      author: {
        id: row.authorId,
        displayName: row.authorName,
        username: row.authorUsername,
        role: row.authorRole,
        title: row.authorTitle,
        avatarUrl: avatarUrl(row.authorAvatar),
      },
      media,
      likeCount: reactions.filter((r) => r.reaction === "LIKE").length,
      dislikeCount: reactions.filter((r) => r.reaction === "DISLIKE").length,
      myReaction: reactions.find((r) => r.userId === viewer.id)?.reaction ?? null,
      commentCount: comments.length,
      unread: false,
      mine,
      comments: comments.map((entry) => ({
        id: entry.comment.id,
        body: entry.comment.deletedAt ? "" : entry.comment.body,
        createdAt: new Date(entry.comment.createdAt).toISOString(),
        deleted: Boolean(entry.comment.deletedAt),
        parentId: entry.comment.parentId,
        mine: entry.comment.authorId === viewer.id,
        canDelete: entry.comment.authorId === viewer.id || moderator,
        author: {
          id: entry.authorId,
          displayName: entry.authorName,
          username: entry.authorUsername,
          role: entry.authorRole,
          title: entry.authorTitle,
          avatarUrl: avatarUrl(entry.authorAvatar),
        },
      })),
      canModerate: moderator,
    };
    return Response.json({ detail, canPost: moderator || config.membersCanPostReviews }, { headers: { "Cache-Control": "no-store" } });
  }

  const filter = url.searchParams.get("filter") ?? "all";
  const type = url.searchParams.get("type") ?? "all";
  const search = (url.searchParams.get("q") ?? "").slice(0, 100);
  const before = url.searchParams.get("before");

  const conditions = [
    moderator || filter === "mine" ? sql`true` : or(eq(reviews.status, "APPROVED"), eq(reviews.authorId, viewer.id))!,
    filter === "mine" ? eq(reviews.authorId, viewer.id) : sql`true`,
    filter === "pending" ? eq(reviews.status, "PENDING") : sql`true`,
    filter === "approved" ? eq(reviews.status, "APPROVED") : sql`true`,
    type === "shorts" ? eq(reviews.kind, "SHORTS") : type === "long" ? eq(reviews.kind, "LONG") : sql`true`,
    search
      ? or(ilikeReviews(search), sql`${profiles.displayName} ilike ${`%${search}%`}`)!
      : sql`true`,
    before ? sql`${reviews.createdAt} < ${new Date(before)}` : sql`true`,
  ];

  let rows = await db
    .select({
      review: reviews,
      authorId: profiles.id,
      authorName: profiles.displayName,
      authorUsername: profiles.username,
      authorRole: profiles.role,
      authorTitle: profiles.title,
      authorAvatar: profiles.avatarUploadId,
    })
    .from(reviews)
    .innerJoin(profiles, eq(profiles.id, reviews.authorId))
    .where(and(...conditions))
    .orderBy(filter === "top" ? desc(reviews.pinned) : desc(reviews.pinned), desc(reviews.createdAt))
    .limit(51);
  const hasMore = rows.length > 50;
  rows = rows.slice(0, 50);

  const ids = rows.map((row) => row.review.id);
  const mediaRows = ids.length ? await db.select().from(reviewMedia).where(inArray(reviewMedia.reviewId, ids)).orderBy(asc(reviewMedia.position)) : [];
  const mediaMap = await loadMediaMap(mediaRows.map((row) => row.mediaId));
  const reactionRows = ids.length ? await db.select().from(reviewReactions).where(inArray(reviewReactions.reviewId, ids)) : [];
  const commentCounts = ids.length
    ? await db
        .select({ reviewId: reviewComments.reviewId, total: count() })
        .from(reviewComments)
        .where(and(inArray(reviewComments.reviewId, ids), isNull(reviewComments.deletedAt)))
        .groupBy(reviewComments.reviewId)
    : [];
  const readRows = ids.length ? await db.select().from(reviewReads).where(and(inArray(reviewReads.reviewId, ids), eq(reviewReads.userId, viewer.id))) : [];

  let items: ReviewItem[] = rows.map((row) => {
    const reactions = reactionRows.filter((reaction) => reaction.reviewId === row.review.id);
    const media: MediaItem[] = [];
    for (const mediaRow of mediaRows.filter((item) => item.reviewId === row.review.id)) {
      const mapped = mediaMap.get(mediaRow.mediaId);
      if (mapped) media.push({ ...mapped, senderName: row.authorName, senderId: row.authorId });
    }
    return {
      id: row.review.id,
      kind: row.review.kind,
      game: row.review.game,
      title: row.review.title,
      description: row.review.description,
      status: row.review.status,
      pinned: row.review.pinned,
      createdAt: new Date(row.review.createdAt).toISOString(),
      author: {
        id: row.authorId,
        displayName: row.authorName,
        username: row.authorUsername,
        role: row.authorRole,
        title: row.authorTitle,
        avatarUrl: avatarUrl(row.authorAvatar),
      },
      media,
      likeCount: reactions.filter((reaction) => reaction.reaction === "LIKE").length,
      dislikeCount: reactions.filter((reaction) => reaction.reaction === "DISLIKE").length,
      myReaction: reactions.find((reaction) => reaction.userId === viewer.id)?.reaction ?? null,
      commentCount: Number(commentCounts.find((entry) => entry.reviewId === row.review.id)?.total ?? 0),
      unread: !readRows.some((entry) => entry.reviewId === row.review.id),
      mine: row.review.authorId === viewer.id,
    };
  });

  if (filter === "top") items = [...items].sort((a, b) => b.likeCount - a.likeCount);
  if (filter === "unread") items = items.filter((item) => item.unread);

  return Response.json(
    { items, hasMore, canPost: moderator || config.membersCanPostReviews, canModerate: moderator, moderationOn: config.reviewModeration },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function ilikeReviews(term: string) {
  return or(sql`${reviews.title} ilike ${`%${term}%`}`, sql`${reviews.description} ilike ${`%${term}%`}`, sql`${reviews.game} ilike ${`%${term}%`}`);
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 30);
  const moderator = viewer.role === "OWNER" || viewer.role === "ADMIN";
  const config = await settings();

  if (action === "create") {
    if (!moderator && !config.membersCanPostReviews) return fail("forbidden", 403);
    const kind = input.kind === "LONG" ? "LONG" : "SHORTS";
    const game = GAMES.includes(stringField(input.game, 30)) ? stringField(input.game, 30) : "Other";
    const title = stringField(input.title, 80);
    const description = stringField(input.description, 1000);
    const mediaIds = Array.isArray(input.mediaIds)
      ? input.mediaIds.filter((value): value is string => typeof value === "string").slice(0, 10)
      : [];
    if (title.length < 3 || title.length > 80) return fail("invalid_title", 422);
    if (description.length > 1000) return fail("description_too_long", 422);
    if (!mediaIds.length) return fail("media_required", 422);
    const owned = await db.select().from(uploads).where(inArray(uploads.id, mediaIds));
    const valid = owned.filter((row) => row.ownerId === viewer.id && (!row.expiresAt || new Date(row.expiresAt).getTime() > Date.now()));
    if (valid.length !== mediaIds.length) return fail("invalid_media", 422);
    const status = !moderator && config.reviewModeration ? "PENDING" : "APPROVED";

    const inserted = await db
      .insert(reviews)
      .values({ authorId: viewer.id, kind, game, title, description, status })
      .returning({ id: reviews.id });
    const reviewId = inserted[0].id;
    await db.insert(reviewMedia).values(
      mediaIds.map((mediaId, index) => {
        const row = valid.find((item) => item.id === mediaId);
        return { reviewId, mediaId, kind: row?.kind === "video" ? "video" : "image", position: index };
      }),
    );

    if (status === "PENDING") {
      const mods = await db.select({ id: profiles.id }).from(profiles).where(or(eq(profiles.role, "OWNER"), eq(profiles.role, "ADMIN")));
      await notifyUsers({
        userIds: mods.map((row) => row.id).filter((id) => id !== viewer.id),
        kind: "moderation",
        title: "Review waiting for approval",
        body: `${viewer.displayName}: ${title}`,
        href: `/reviews/${reviewId}`,
      });
    } else {
      const others = await db.select({ id: profiles.id }).from(profiles).where(ne(profiles.id, viewer.id));
      await notifyUsers({
        userIds: others.map((row) => row.id),
        kind: "review",
        title: `${viewer.displayName} posted a review`,
        body: `${game} · ${title}`,
        href: `/reviews/${reviewId}`,
      });
    }
    return Response.json({ ok: true, id: reviewId, status });
  }

  if ((action === "moderate" || action === "delete") && !moderator) {
    const reviewIdEarly = stringField(input.reviewId, 60);
    const early = reviewIdEarly ? await db.select({ authorId: reviews.authorId }).from(reviews).where(eq(reviews.id, reviewIdEarly)).limit(1) : [];
    if (action === "moderate" || !early[0] || early[0].authorId !== viewer.id) return fail("forbidden", 403);
  }
  const reviewId = stringField(input.reviewId, 60);
  if (!reviewId) return fail("review_required", 422);
  const reviewRows = await db.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
  const review = reviewRows[0];
  if (!review) return fail("not_found", 404);

  if (action === "react") {
    const reaction = input.reaction === "DISLIKE" ? "DISLIKE" : "LIKE";
    const existing = await db
      .select()
      .from(reviewReactions)
      .where(and(eq(reviewReactions.reviewId, reviewId), eq(reviewReactions.userId, viewer.id)))
      .limit(1);
    if (existing[0]?.reaction === reaction) {
      await db.delete(reviewReactions).where(and(eq(reviewReactions.reviewId, reviewId), eq(reviewReactions.userId, viewer.id)));
      return Response.json({ ok: true, reaction: null });
    }
    await db
      .insert(reviewReactions)
      .values({ reviewId, userId: viewer.id, reaction })
      .onConflictDoUpdate({ target: [reviewReactions.reviewId, reviewReactions.userId], set: { reaction } });
    if (review.authorId !== viewer.id) {
      await notifyUsers({
        userIds: [review.authorId],
        kind: "reaction",
        title: `${viewer.displayName} reacted to your review`,
        body: review.title,
        href: `/reviews/${reviewId}`,
      });
    }
    return Response.json({ ok: true, reaction });
  }

  if (action === "comment") {
    const message = stringField(input.body, 1000);
    if (message.length < 1) return fail("comment_required", 422);
    const parentId = stringField(input.parentId, 60) || null;
    const inserted = await db
      .insert(reviewComments)
      .values({ reviewId, authorId: viewer.id, body: message, parentId })
      .returning({ id: reviewComments.id });
    const recipients = [review.authorId];
    if (parentId) {
      const parent = await db.select({ authorId: reviewComments.authorId }).from(reviewComments).where(eq(reviewComments.id, parentId)).limit(1);
      if (parent[0]) recipients.push(parent[0].authorId);
    }
    await notifyUsers({
      userIds: recipients.filter((id) => id !== viewer.id),
      kind: "reply",
      title: `${viewer.displayName} commented`,
      body: message.slice(0, 160),
      href: `/reviews/${reviewId}`,
    });
    return Response.json({ ok: true, id: inserted[0].id });
  }

  if (action === "delete-comment") {
    const commentId = stringField(input.commentId, 60);
    const rows = await db.select().from(reviewComments).where(eq(reviewComments.id, commentId)).limit(1);
    const comment = rows[0];
    if (!comment) return fail("not_found", 404);
    if (comment.authorId !== viewer.id && !moderator) return fail("forbidden", 403);
    await db.update(reviewComments).set({ deletedAt: new Date(), body: "" }).where(eq(reviewComments.id, commentId));
    return Response.json({ ok: true });
  }

  if (action === "moderate") {
    if (!moderator) return fail("forbidden", 403);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.status === "APPROVED" || input.status === "HIDDEN" || input.status === "PENDING") patch.status = input.status;
    if (typeof input.pinned === "boolean") patch.pinned = input.pinned;
    await db.update(reviews).set(patch).where(eq(reviews.id, reviewId));
    if (review.authorId !== viewer.id) {
      await notifyUsers({
        userIds: [review.authorId],
        kind: "moderation",
        title: `Your review was ${String(patch.status ?? "updated").toLowerCase()}`,
        body: review.title,
        href: `/reviews/${reviewId}`,
      });
    }
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    if (!moderator && review.authorId !== viewer.id) return fail("forbidden", 403);
    const media = await db.select({ mediaId: reviewMedia.mediaId }).from(reviewMedia).where(eq(reviewMedia.reviewId, reviewId));
    await db.delete(reviews).where(eq(reviews.id, reviewId));
    const mediaIds = media.map((row) => row.mediaId);
    if (mediaIds.length) {
      const rows = await db.select({ id: uploads.id, thumbId: uploads.thumbId }).from(uploads).where(inArray(uploads.id, mediaIds));
      await db.delete(uploads).where(inArray(uploads.id, mediaIds));
      const thumbs = rows.map((row) => row.thumbId).filter((id): id is string => Boolean(id));
      if (thumbs.length) await db.delete(uploads).where(inArray(uploads.id, thumbs));
    }
    return Response.json({ ok: true });
  }

  if (action === "read") {
    await db.insert(reviewReads).values({ reviewId, userId: viewer.id }).onConflictDoNothing();
    return Response.json({ ok: true });
  }

  return fail("unknown_action", 400);
}

export const _unused = mapMediaRow;
