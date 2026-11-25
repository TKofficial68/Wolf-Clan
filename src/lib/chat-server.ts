import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  directConversationMembers,
  directMessageHidden,
  directMessageReactions,
  directMessages,
  groupMembers,
  groupMessageReactions,
  groupMessageReads,
  groupMessages,
  groups,
  profiles,
  typingStates,
  uploads,
  userBlocks,
  userPresence,
} from "@/db/schema";
import type { SessionUser } from "./auth";
import type { ChatMember, ChatMessage, ChatPayload, ChatSender, ChatScopeKind } from "./chat-types";
import { loadMediaMap } from "./media-server";
import { isUuid } from "./http";
import { notifyUsers } from "./notify";
import { hasPermission } from "./perms";

export class ChatError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const PAGE = 40;
const ONLINE_MS = 90_000;

function online(status: string | null, seen: Date | null): boolean {
  return status === "online" && Boolean(seen) && Date.now() - new Date(seen as Date).getTime() < ONLINE_MS;
}

function senderOf(row: {
  senderId: string;
  displayName?: string | null;
  username?: string | null;
  role?: string | null;
  title?: string | null;
  avatarUploadId?: string | null;
}): ChatSender {
  return {
    id: row.senderId,
    displayName: row.displayName ?? "Member",
    username: row.username ?? "",
    role: row.role ?? "MEMBER",
    title: row.title ?? null,
    avatarUrl: row.avatarUploadId ? `/api/uploads/${row.avatarUploadId}` : null,
  };
}

export type GroupAccess = {
  group: typeof groups.$inferSelect;
  member: typeof groupMembers.$inferSelect;
  canPost: boolean;
  blockedReason: ChatPayload["postBlockedReason"];
  canModerate: boolean;
};

export async function requireGroup(viewer: SessionUser, groupId: string): Promise<GroupAccess> {
  const groupRows = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const group = groupRows[0];
  if (!group) throw new ChatError("not_found", 404);
  const memberRows = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)))
    .limit(1);
  const member = memberRows[0];
  if (!member) throw new ChatError("not_a_member", 403);
  const globalMod = viewer.role === "OWNER" || viewer.role === "ADMIN";
  const canModerate = globalMod || member.groupRole === "MODERATOR";
  const muted = member.mutedUntil ? new Date(member.mutedUntil).getTime() > Date.now() : false;
  const restrictedBlocked = group.postRestricted && !canModerate;
  const blockedReason: ChatPayload["postBlockedReason"] = restrictedBlocked
    ? "restricted"
    : muted
      ? "muted"
      : null;
  return { group, member, canPost: blockedReason === null, blockedReason, canModerate };
}

export async function requireDm(viewer: SessionUser, conversationId: string) {
  const rows = await db
    .select()
    .from(directConversationMembers)
    .where(and(eq(directConversationMembers.conversationId, conversationId), eq(directConversationMembers.userId, viewer.id)))
    .limit(1);
  if (!rows.length) throw new ChatError("not_a_member", 403);
  const peerRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      username: profiles.username,
      role: profiles.role,
      title: profiles.title,
      avatarUploadId: profiles.avatarUploadId,
      onlineVisibility: profiles.onlineVisibility,
      lastSeenVisibility: profiles.lastSeenVisibility,
      lastSeenAt: profiles.lastSeenAt,
      presenceStatus: userPresence.status,
      presenceSeen: userPresence.lastSeenAt,
    })
    .from(directConversationMembers)
    .innerJoin(profiles, eq(profiles.id, directConversationMembers.userId))
    .leftJoin(userPresence, eq(userPresence.userId, profiles.id))
    .where(and(eq(directConversationMembers.conversationId, conversationId), ne(directConversationMembers.userId, viewer.id)))
    .limit(1);
  const blocks = await db
    .select()
    .from(userBlocks)
    .where(or(eq(userBlocks.blockerId, viewer.id), eq(userBlocks.blockedId, viewer.id)));
  const peer = peerRows[0] ?? null;
  const blockedByMe = peer ? blocks.some((b) => b.blockerId === viewer.id && b.blockedId === peer.id) : false;
  const blockedMe = peer ? blocks.some((b) => b.blockerId === peer.id && b.blockedId === viewer.id) : false;
  return {
    membership: rows[0],
    peer,
    blockedByMe,
    blockedMe,
    canPost: !blockedByMe && !blockedMe,
  };
}

type RawMessage = {
  id: string;
  senderId: string;
  body: string | null;
  kind: string;
  mediaId: string | null;
  clientMessageId: string | null;
  replyToId: string | null;
  pinnedAt: Date | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  status?: string;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  displayName?: string | null;
  username?: string | null;
  role?: string | null;
  title?: string | null;
  avatarUploadId?: string | null;
};

export async function buildMessages(
  scope: ChatScopeKind,
  rows: RawMessage[],
  viewerId: string,
): Promise<ChatMessage[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const mediaMap = await loadMediaMap(rows.map((row) => row.mediaId));
  const replyIds = rows.map((row) => row.replyToId).filter((id): id is string => Boolean(id));

  const replyRows = replyIds.length
    ? scope === "dm"
      ? await db
          .select({ id: directMessages.id, body: directMessages.body, kind: directMessages.kind, senderId: directMessages.senderId, name: profiles.displayName, deletedAt: directMessages.deletedAt })
          .from(directMessages)
          .innerJoin(profiles, eq(profiles.id, directMessages.senderId))
          .where(inArray(directMessages.id, replyIds))
      : await db
          .select({ id: groupMessages.id, body: groupMessages.body, kind: groupMessages.kind, senderId: groupMessages.senderId, name: profiles.displayName, deletedAt: groupMessages.deletedAt })
          .from(groupMessages)
          .innerJoin(profiles, eq(profiles.id, groupMessages.senderId))
          .where(inArray(groupMessages.id, replyIds))
    : [];

  const reactionRows =
    scope === "dm"
      ? await db
          .select({ messageId: directMessageReactions.messageId, reaction: directMessageReactions.reaction, userId: directMessageReactions.userId, name: profiles.displayName })
          .from(directMessageReactions)
          .innerJoin(profiles, eq(profiles.id, directMessageReactions.userId))
          .where(inArray(directMessageReactions.messageId, ids))
      : await db
          .select({ messageId: groupMessageReactions.messageId, reaction: groupMessageReactions.reaction, userId: groupMessageReactions.userId, name: profiles.displayName })
          .from(groupMessageReactions)
          .innerJoin(profiles, eq(profiles.id, groupMessageReactions.userId))
          .where(inArray(groupMessageReactions.messageId, ids));

  const readRows =
    scope === "group"
      ? await db
          .select({ messageId: groupMessageReads.messageId, userId: groupMessageReads.userId, name: profiles.displayName, at: groupMessageReads.readAt })
          .from(groupMessageReads)
          .innerJoin(profiles, eq(profiles.id, groupMessageReads.userId))
          .where(inArray(groupMessageReads.messageId, ids))
      : [];

  return rows.map((row) => {
    const deleted = Boolean(row.deletedAt);
    const reply = replyRows.find((item) => item.id === row.replyToId);
    const reactions = new Map<string, { count: number; mine: boolean; names: string[] }>();
    for (const reaction of reactionRows.filter((item) => item.messageId === row.id)) {
      const entry = reactions.get(reaction.reaction) ?? { count: 0, mine: false, names: [] };
      entry.count += 1;
      if (reaction.userId === viewerId) entry.mine = true;
      entry.names.push(reaction.name);
      reactions.set(reaction.reaction, entry);
    }
    const readers = readRows.filter((item) => item.messageId === row.id);
    let status = row.status ?? "sent";
    if (row.senderId === viewerId && scope === "dm") {
      status = row.readAt ? "read" : row.deliveredAt ? "delivered" : (row.status ?? "sent");
    }
    return {
      id: row.id,
      clientMessageId: row.clientMessageId,
      kind: row.kind,
      body: deleted ? null : row.body,
      createdAt: new Date(row.createdAt).toISOString(),
      editedAt: row.editedAt ? new Date(row.editedAt).toISOString() : null,
      deleted,
      mine: row.senderId === viewerId,
      status,
      sender: senderOf(row),
      media: row.mediaId ? (mediaMap.get(row.mediaId) ?? null) : null,
      replyTo: reply
        ? {
            id: reply.id,
            senderName: reply.name,
            preview: reply.deletedAt
              ? "This message was deleted"
              : reply.kind === "text"
                ? (reply.body ?? "").slice(0, 110)
                : `[${reply.kind}]`,
            kind: reply.kind,
          }
        : null,
      reactions: Array.from(reactions.entries()).map(([emoji, value]) => ({ emoji, count: value.count, mine: value.mine, names: value.names })),
      pinned: Boolean(row.pinnedAt),
      readCount: readers.length,
      readBy: readers.slice(0, 30).map((reader) => ({ name: reader.name, at: new Date(reader.at).toISOString() })),
    };
  });
}

const messageColumns = {
  id: directMessages.id,
  senderId: directMessages.senderId,
  body: directMessages.body,
  kind: directMessages.kind,
  mediaId: directMessages.mediaId,
  clientMessageId: directMessages.clientMessageId,
  replyToId: directMessages.replyToId,
  pinnedAt: directMessages.pinnedAt,
  editedAt: directMessages.editedAt,
  deletedAt: directMessages.deletedAt,
  createdAt: directMessages.createdAt,
  status: directMessages.status,
  deliveredAt: directMessages.deliveredAt,
  readAt: directMessages.readAt,
  displayName: profiles.displayName,
  username: profiles.username,
  role: profiles.role,
  title: profiles.title,
  avatarUploadId: profiles.avatarUploadId,
};

const groupMessageColumns = {
  id: groupMessages.id,
  senderId: groupMessages.senderId,
  body: groupMessages.body,
  kind: groupMessages.kind,
  mediaId: groupMessages.mediaId,
  clientMessageId: groupMessages.clientMessageId,
  replyToId: groupMessages.replyToId,
  pinnedAt: groupMessages.pinnedAt,
  editedAt: groupMessages.editedAt,
  deletedAt: groupMessages.deletedAt,
  createdAt: groupMessages.createdAt,
  displayName: profiles.displayName,
  username: profiles.username,
  role: profiles.role,
  title: profiles.title,
  avatarUploadId: profiles.avatarUploadId,
};

export type ChatQuery = { before?: string; search?: string; around?: string };

export async function getChatPayload(
  viewer: SessionUser,
  kind: ChatScopeKind,
  id: string,
  query: ChatQuery = {},
): Promise<ChatPayload> {
  const typingRows = await db
    .select({ name: profiles.displayName, updatedAt: typingStates.updatedAt })
    .from(typingStates)
    .innerJoin(profiles, eq(profiles.id, typingStates.userId))
    .where(and(eq(typingStates.key, `${kind}:${id}`), ne(typingStates.userId, viewer.id), gte(typingStates.updatedAt, new Date(Date.now() - 5000))));
  const typing = typingRows.map((row) => row.name);

  if (kind === "dm") {
    const access = await requireDm(viewer, id);
    const lastReadAt = access.membership.lastReadAt;
    const unreadRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(directMessages)
      .where(
        and(
          eq(directMessages.conversationId, id),
          ne(directMessages.senderId, viewer.id),
          lastReadAt ? gt(directMessages.createdAt, lastReadAt) : sql`true`,
        ),
      );
    const firstUnread = lastReadAt
      ? await db
          .select({ id: directMessages.id })
          .from(directMessages)
          .where(and(eq(directMessages.conversationId, id), ne(directMessages.senderId, viewer.id), gt(directMessages.createdAt, lastReadAt)))
          .orderBy(asc(directMessages.createdAt))
          .limit(1)
      : [];

    if (!query.search) {
      await db
        .update(directMessages)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(and(eq(directMessages.conversationId, id), ne(directMessages.senderId, viewer.id), eq(directMessages.status, "sent")));
    }

    const hidden = await db.select({ messageId: directMessageHidden.messageId }).from(directMessageHidden).where(eq(directMessageHidden.userId, viewer.id));
    const hiddenIds = hidden.map((row) => row.messageId);

    let where = and(
      eq(directMessages.conversationId, id),
      hiddenIds.length ? sql`${directMessages.id} not in (${sql.join(hiddenIds.map((value) => sql`${value}`), sql`, `)})` : sql`true`,
      query.search ? ilike(directMessages.body, `%${query.search}%`) : sql`true`,
      query.before ? lt(directMessages.createdAt, new Date(query.before)) : sql`true`,
    );
    let rows = await db
      .select(messageColumns)
      .from(directMessages)
      .innerJoin(profiles, eq(profiles.id, directMessages.senderId))
      .where(where)
      .orderBy(desc(directMessages.createdAt))
      .limit(PAGE + 1);
    let hasMore = rows.length > PAGE;
    rows = rows.slice(0, PAGE);

    const pinnedRows = await db
      .select({ id: directMessages.id, body: directMessages.body, kind: directMessages.kind, createdAt: directMessages.createdAt, name: profiles.displayName })
      .from(directMessages)
      .innerJoin(profiles, eq(profiles.id, directMessages.senderId))
      .where(and(eq(directMessages.conversationId, id), sql`${directMessages.pinnedAt} is not null`, isNull(directMessages.deletedAt)))
      .orderBy(desc(directMessages.pinnedAt))
      .limit(10);

    const members: ChatMember[] = [
      {
        id: viewer.id,
        displayName: viewer.displayName,
        username: viewer.username,
        role: viewer.role,
        title: viewer.title,
        avatarUrl: viewer.avatarUploadId ? `/api/uploads/${viewer.avatarUploadId}` : null,
        online: true,
        groupRole: "MEMBER",
        mutedUntil: null,
      },
    ];
    if (access.peer) {
      members.push({
        id: access.peer.id,
        displayName: access.peer.displayName,
        username: access.peer.username,
        role: access.peer.role,
        title: access.peer.title,
        avatarUrl: access.peer.avatarUploadId ? `/api/uploads/${access.peer.avatarUploadId}` : null,
        online: access.peer.onlineVisibility === "everyone" && online(access.peer.presenceStatus, access.peer.presenceSeen),
        groupRole: "MEMBER",
        mutedUntil: null,
      });
    }

    return {
      scope: { kind, id },
      group: null,
      peer: access.peer
        ? {
            id: access.peer.id,
            displayName: access.peer.displayName,
            username: access.peer.username,
            role: access.peer.role,
            title: access.peer.title,
            avatarUrl: access.peer.avatarUploadId ? `/api/uploads/${access.peer.avatarUploadId}` : null,
            online: access.peer.onlineVisibility === "everyone" && online(access.peer.presenceStatus, access.peer.presenceSeen),
            showLastSeen: access.peer.lastSeenVisibility === "everyone",
            lastSeenAt: access.peer.lastSeenAt ? new Date(access.peer.lastSeenAt).toISOString() : null,
            blockedByMe: access.blockedByMe,
            blockedMe: access.blockedMe,
          }
        : null,
      members,
      canPost: access.canPost,
      postBlockedReason: access.blockedByMe || access.blockedMe ? "blocked" : null,
      canModerate: false,
      canManageGroup: false,
      groupRole: "MEMBER",
      muteUntil: null,
      pinned: pinnedRows.map((row) => ({
        id: row.id,
        senderName: row.name,
        preview: row.kind === "text" ? (row.body ?? "") : `[${row.kind}]`,
        kind: row.kind,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
      messages: await buildMessages(kind, [...rows].reverse(), viewer.id),
      hasMore,
      firstUnreadId: firstUnread[0]?.id ?? null,
      unreadCount: unreadRows[0]?.count ?? 0,
      typing,
      serverTime: new Date().toISOString(),
    };
  }

  const access = await requireGroup(viewer, id);
  const lastReadAt = access.member.lastReadAt;
  const unreadRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMessages)
    .where(
      and(
        eq(groupMessages.groupId, id),
        ne(groupMessages.senderId, viewer.id),
        lastReadAt ? gt(groupMessages.createdAt, lastReadAt) : sql`true`,
      ),
    );
  const firstUnread = lastReadAt
    ? await db
        .select({ id: groupMessages.id })
        .from(groupMessages)
        .where(and(eq(groupMessages.groupId, id), ne(groupMessages.senderId, viewer.id), gt(groupMessages.createdAt, lastReadAt)))
        .orderBy(asc(groupMessages.createdAt))
        .limit(1)
    : [];

  let rows = await db
    .select(groupMessageColumns)
    .from(groupMessages)
    .innerJoin(profiles, eq(profiles.id, groupMessages.senderId))
    .where(
      and(
        eq(groupMessages.groupId, id),
        query.search ? ilike(groupMessages.body, `%${query.search}%`) : sql`true`,
        query.before ? lt(groupMessages.createdAt, new Date(query.before)) : sql`true`,
      ),
    )
    .orderBy(desc(groupMessages.createdAt))
    .limit(PAGE + 1);
  const hasMore = rows.length > PAGE;
  rows = rows.slice(0, PAGE);

  if (!query.search) {
    const unreadIds = await db
      .select({ id: groupMessages.id })
      .from(groupMessages)
      .where(and(eq(groupMessages.groupId, id), ne(groupMessages.senderId, viewer.id), lastReadAt ? gt(groupMessages.createdAt, lastReadAt) : sql`true`))
      .limit(120);
    if (unreadIds.length) {
      await db
        .insert(groupMessageReads)
        .values(unreadIds.map((row) => ({ messageId: row.id, userId: viewer.id })))
        .onConflictDoNothing();
    }
    await db
      .update(groupMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, viewer.id)));
  }

  const memberRows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      username: profiles.username,
      role: profiles.role,
      title: profiles.title,
      avatarUploadId: profiles.avatarUploadId,
      groupRole: groupMembers.groupRole,
      mutedUntil: groupMembers.mutedUntil,
      presenceStatus: userPresence.status,
      presenceSeen: userPresence.lastSeenAt,
      onlineVisibility: profiles.onlineVisibility,
    })
    .from(groupMembers)
    .innerJoin(profiles, eq(profiles.id, groupMembers.userId))
    .leftJoin(userPresence, eq(userPresence.userId, profiles.id))
    .where(eq(groupMembers.groupId, id))
    .orderBy(asc(profiles.displayName));

  const pinnedRows = await db
    .select({ id: groupMessages.id, body: groupMessages.body, kind: groupMessages.kind, createdAt: groupMessages.createdAt, name: profiles.displayName })
    .from(groupMessages)
    .innerJoin(profiles, eq(profiles.id, groupMessages.senderId))
    .where(and(eq(groupMessages.groupId, id), sql`${groupMessages.pinnedAt} is not null`, isNull(groupMessages.deletedAt)))
    .orderBy(desc(groupMessages.pinnedAt))
    .limit(10);

  return {
    scope: { kind, id },
    group: {
      id: access.group.id,
      name: access.group.name,
      description: access.group.description,
      accent: access.group.accent,
      icon: access.group.icon,
    },
    peer: null,
    members: memberRows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      username: row.username,
      role: row.role,
      title: row.title ?? null,
      avatarUrl: row.avatarUploadId ? `/api/uploads/${row.avatarUploadId}` : null,
      online: row.onlineVisibility === "everyone" && online(row.presenceStatus, row.presenceSeen),
      groupRole: row.groupRole,
      mutedUntil: row.mutedUntil ? new Date(row.mutedUntil).toISOString() : null,
    })),
    canPost: access.canPost,
    postBlockedReason: access.blockedReason,
    canModerate: access.canModerate,
    canManageGroup: access.canModerate,
    groupRole: access.member.groupRole,
    muteUntil: access.member.mutedUntil ? new Date(access.member.mutedUntil).toISOString() : null,
    pinned: pinnedRows.map((row) => ({
      id: row.id,
      senderName: row.name,
      preview: row.kind === "text" ? (row.body ?? "") : `[${row.kind}]`,
      kind: row.kind,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    messages: await buildMessages(kind, [...rows].reverse(), viewer.id),
    hasMore,
    firstUnreadId: firstUnread[0]?.id ?? null,
    unreadCount: unreadRows[0]?.count ?? 0,
    typing,
    serverTime: new Date().toISOString(),
  };
}

async function assertRateLimit(userId: string) {
  const since = new Date(Date.now() - 10_000);
  const dm = await db.select({ count: sql<number>`count(*)::int` }).from(directMessages).where(and(eq(directMessages.senderId, userId), gt(directMessages.createdAt, since)));
  const grp = await db.select({ count: sql<number>`count(*)::int` }).from(groupMessages).where(and(eq(groupMessages.senderId, userId), gt(groupMessages.createdAt, since)));
  if ((dm[0]?.count ?? 0) + (grp[0]?.count ?? 0) >= 20) throw new ChatError("rate_limited", 429);
}

export async function sendMessage(
  viewer: SessionUser,
  input: {
    kind: ChatScopeKind;
    id: string;
    body?: string;
    messageType?: string;
    mediaId?: string | null;
    clientMessageId?: string;
    replyToId?: string | null;
  },
): Promise<{ id: string; duplicate: boolean }> {
  if (!isUuid(input.id)) throw new ChatError("invalid_id", 422);
  const body = (input.body ?? "").trim().slice(0, 4000);
  const messageType = input.messageType && ["text", "image", "video", "audio", "voice", "document"].includes(input.messageType) ? input.messageType : "text";
  if (messageType === "text" && !body) throw new ChatError("empty_message", 422);
  if (messageType !== "text" && !input.mediaId) throw new ChatError("media_required", 422);
  const clientMessageId = input.clientMessageId?.slice(0, 80) ?? null;
  if (clientMessageId) {
    const existing =
      input.kind === "dm"
        ? await db
            .select({ id: directMessages.id })
            .from(directMessages)
            .where(and(eq(directMessages.senderId, viewer.id), eq(directMessages.clientMessageId, clientMessageId)))
            .limit(1)
        : await db
            .select({ id: groupMessages.id })
            .from(groupMessages)
            .where(and(eq(groupMessages.senderId, viewer.id), eq(groupMessages.clientMessageId, clientMessageId)))
            .limit(1);
    if (existing.length) return { id: existing[0].id, duplicate: true };
  }

  await assertRateLimit(viewer.id);

  if (input.kind === "dm") {
    const access = await requireDm(viewer, input.id);
    if (!access.canPost) throw new ChatError("blocked", 403);
    if (input.mediaId) {
      const owned = await db.select({ id: uploads.id }).from(uploads).where(and(eq(uploads.id, input.mediaId), eq(uploads.ownerId, viewer.id))).limit(1);
      if (!owned.length) throw new ChatError("invalid_media", 422);
    }
    const inserted = await db
      .insert(directMessages)
      .values({
        conversationId: input.id,
        senderId: viewer.id,
        body: body || null,
        kind: messageType,
        mediaId: input.mediaId ?? null,
        clientMessageId,
        replyToId: input.replyToId ?? null,
        status: "sent",
      })
      .returning({ id: directMessages.id });
    await db.execute(sql`update direct_conversations set last_message_at = now() where id = ${input.id}`);
    if (access.peer) {
      await notifyUsers({
        userIds: [access.peer.id],
        kind: "dm",
        title: viewer.displayName,
        body: messageType === "text" ? body : `[${messageType}]`,
        href: `/chat/${input.id}`,
      });
    }
    return { id: inserted[0].id, duplicate: false };
  }

  const access = await requireGroup(viewer, input.id);
  if (!access.canPost) throw new ChatError(access.blockedReason ?? "forbidden", 403);
  if (input.mediaId) {
    const owned = await db.select({ id: uploads.id }).from(uploads).where(and(eq(uploads.id, input.mediaId), eq(uploads.ownerId, viewer.id))).limit(1);
    if (!owned.length) throw new ChatError("invalid_media", 422);
  }
  const inserted = await db
    .insert(groupMessages)
    .values({
      groupId: input.id,
      senderId: viewer.id,
      body: body || null,
      kind: messageType,
      mediaId: input.mediaId ?? null,
      clientMessageId,
      replyToId: input.replyToId ?? null,
    })
    .returning({ id: groupMessages.id });

  const others = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.groupId, input.id), ne(groupMembers.userId, viewer.id)));
  const mentioned = others.filter((row) => {
    const member = row.userId;
    return body.toLowerCase().includes(`@${member}`);
  });
  await notifyUsers({
    userIds: others.map((row) => row.userId).filter((uid) => !mentioned.some((m) => m.userId === uid)),
    kind: "group",
    title: access.group.name,
    body: `${viewer.displayName}: ${messageType === "text" ? body : `[${messageType}]`}`,
    href: `/groups/${input.id}`,
  });
  if (mentioned.length) {
    await notifyUsers({
      userIds: mentioned.map((row) => row.userId),
      kind: "mention",
      title: `${viewer.displayName} mentioned you`,
      body: body.slice(0, 160),
      href: `/groups/${input.id}`,
    });
  }
  return { id: inserted[0].id, duplicate: false };
}

async function loadMessageScope(
  scope: ChatScopeKind,
  messageId: string,
): Promise<{ id: string; scopeId: string; senderId: string; mediaId: string | null } | null> {
  if (scope === "dm") {
    const rows = await db
      .select({ id: directMessages.id, scopeId: directMessages.conversationId, senderId: directMessages.senderId, mediaId: directMessages.mediaId })
      .from(directMessages)
      .where(eq(directMessages.id, messageId))
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db
    .select({ id: groupMessages.id, scopeId: groupMessages.groupId, senderId: groupMessages.senderId, mediaId: groupMessages.mediaId })
    .from(groupMessages)
    .where(eq(groupMessages.id, messageId))
    .limit(1);
  return rows[0] ?? null;
}

export async function actOnMessage(
  viewer: SessionUser,
  action: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const kind: ChatScopeKind = input.kind === "group" ? "group" : "dm";
  const messageId = typeof input.messageId === "string" ? input.messageId : "";
  if (!isUuid(messageId)) throw new ChatError("invalid_id", 422);
  const target = await loadMessageScope(kind, messageId);
  if (!target) throw new ChatError("not_found", 404);

  if (kind === "dm") {
    await requireDm(viewer, target.scopeId);
  } else {
    await requireGroup(viewer, target.scopeId);
  }

  if (action === "edit") {
    if (target.senderId !== viewer.id) throw new ChatError("forbidden", 403);
    const body = typeof input.body === "string" ? input.body.trim().slice(0, 4000) : "";
    if (!body) throw new ChatError("empty_message", 422);
    if (kind === "dm") {
      await db.update(directMessages).set({ body, editedAt: new Date() }).where(eq(directMessages.id, messageId));
    } else {
      await db.update(groupMessages).set({ body, editedAt: new Date() }).where(eq(groupMessages.id, messageId));
    }
    return { ok: true };
  }

  if (action === "delete") {
    const mode = input.mode === "all" ? "all" : "me";
    if (mode === "me") {
      if (kind === "dm") {
        await db.insert(directMessageHidden).values({ messageId, userId: viewer.id }).onConflictDoNothing();
        return { ok: true };
      }
      throw new ChatError("group_delete_me_unsupported", 422);
    }
    const access = kind === "group" ? await requireGroup(viewer, target.scopeId) : null;
    const canDeleteOthers = access?.canModerate || (await hasPermission(viewer, "delete_messages"));
    const allowed = target.senderId === viewer.id || Boolean(canDeleteOthers);
    if (!allowed) throw new ChatError("forbidden", 403);
    if (kind === "dm") {
      await db
        .update(directMessages)
        .set({ deletedAt: new Date(), deletedBy: viewer.id, body: null, mediaId: null, kind: "text" })
        .where(eq(directMessages.id, messageId));
    } else {
      await db
        .update(groupMessages)
        .set({ deletedAt: new Date(), deletedBy: viewer.id, body: null, mediaId: null, kind: "text" })
        .where(eq(groupMessages.id, messageId));
    }
    if (target.mediaId) {
      const media = await db.select({ thumbId: uploads.thumbId }).from(uploads).where(eq(uploads.id, target.mediaId)).limit(1);
      await db.delete(uploads).where(eq(uploads.id, target.mediaId));
      if (media[0]?.thumbId) await db.delete(uploads).where(eq(uploads.id, media[0].thumbId));
    }
    return { ok: true };
  }

  if (action === "react") {
    const emoji = typeof input.reaction === "string" ? input.reaction.slice(0, 8) : "";
    if (!emoji) throw new ChatError("reaction_required", 422);
    if (kind === "dm") {
      const existing = await db
        .select({ reaction: directMessageReactions.reaction })
        .from(directMessageReactions)
        .where(and(eq(directMessageReactions.messageId, messageId), eq(directMessageReactions.userId, viewer.id)))
        .limit(1);
      if (existing[0]?.reaction === emoji) {
        await db.delete(directMessageReactions).where(and(eq(directMessageReactions.messageId, messageId), eq(directMessageReactions.userId, viewer.id)));
        return { ok: true, removed: true };
      }
      await db
        .insert(directMessageReactions)
        .values({ messageId, userId: viewer.id, reaction: emoji })
        .onConflictDoUpdate({ target: [directMessageReactions.messageId, directMessageReactions.userId], set: { reaction: emoji } });
    } else {
      const existing = await db
        .select({ reaction: groupMessageReactions.reaction })
        .from(groupMessageReactions)
        .where(and(eq(groupMessageReactions.messageId, messageId), eq(groupMessageReactions.userId, viewer.id)))
        .limit(1);
      if (existing[0]?.reaction === emoji) {
        await db.delete(groupMessageReactions).where(and(eq(groupMessageReactions.messageId, messageId), eq(groupMessageReactions.userId, viewer.id)));
        return { ok: true, removed: true };
      }
      await db
        .insert(groupMessageReactions)
        .values({ messageId, userId: viewer.id, reaction: emoji })
        .onConflictDoUpdate({ target: [groupMessageReactions.messageId, groupMessageReactions.userId], set: { reaction: emoji } });
    }
    if (target.senderId !== viewer.id) {
      await notifyUsers({
        userIds: [target.senderId],
        kind: "reaction",
        title: `${viewer.displayName} reacted ${emoji}`,
        body: "Tap to open the conversation",
        href: kind === "dm" ? `/chat/${target.scopeId}` : `/groups/${target.scopeId}`,
      });
    }
    return { ok: true, removed: false };
  }

  if (action === "pin") {
    const pinned = input.pinned === true;
    if (kind === "group") {
      const access = await requireGroup(viewer, target.scopeId);
      if (!access.canModerate && !(await hasPermission(viewer, "pin_messages"))) throw new ChatError("forbidden", 403);
      await db.update(groupMessages).set({ pinnedAt: pinned ? new Date() : null }).where(eq(groupMessages.id, messageId));
    } else {
      await db.update(directMessages).set({ pinnedAt: pinned ? new Date() : null }).where(eq(directMessages.id, messageId));
    }
    return { ok: true };
  }

  throw new ChatError("unknown_action", 400);
}

export async function markThreadRead(viewer: SessionUser, kind: ChatScopeKind, id: string, messageId?: string): Promise<void> {
  const now = new Date();
  if (kind === "dm") {
    await requireDm(viewer, id);
    await db.update(directConversationMembers).set({ lastReadAt: now }).where(and(eq(directConversationMembers.conversationId, id), eq(directConversationMembers.userId, viewer.id)));
    await db
      .update(directMessages)
      .set({ status: "read", readAt: now, deliveredAt: now })
      .where(and(eq(directMessages.conversationId, id), ne(directMessages.senderId, viewer.id), isNull(directMessages.readAt)));
    return;
  }
  await requireGroup(viewer, id);
  const unread = await db
    .select({ id: groupMessages.id })
    .from(groupMessages)
    .where(
      messageId
        ? and(eq(groupMessages.groupId, id), sql`${groupMessages.createdAt} <= (select created_at from group_messages where id = ${messageId})`)
        : eq(groupMessages.groupId, id),
    )
    .limit(200);
  if (unread.length) {
    await db.insert(groupMessageReads).values(unread.map((row) => ({ messageId: row.id, userId: viewer.id }))).onConflictDoNothing();
  }
  await db.update(groupMembers).set({ lastReadAt: now }).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, viewer.id)));
}

export async function setTyping(viewer: SessionUser, kind: ChatScopeKind, id: string): Promise<void> {
  if (kind === "dm") {
    await requireDm(viewer, id);
  } else {
    await requireGroup(viewer, id);
  }
  await db
    .insert(typingStates)
    .values({ key: `${kind}:${id}`, userId: viewer.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [typingStates.key, typingStates.userId], set: { updatedAt: new Date() } });
}

export async function clearDmForMe(viewer: SessionUser, conversationId: string): Promise<void> {
  await requireDm(viewer, conversationId);
  const rows = await db.select({ id: directMessages.id }).from(directMessages).where(eq(directMessages.conversationId, conversationId));
  if (rows.length) {
    await db.insert(directMessageHidden).values(rows.map((row) => ({ messageId: row.id, userId: viewer.id }))).onConflictDoNothing();
  }
  await db.update(directConversationMembers).set({ lastReadAt: new Date() }).where(and(eq(directConversationMembers.conversationId, conversationId), eq(directConversationMembers.userId, viewer.id)));
}

export async function searchConversation(viewer: SessionUser, kind: ChatScopeKind, id: string, term: string) {
  const payload = await getChatPayload(viewer, kind, id, { search: term.slice(0, 120) });
  return payload.messages.filter((message) => message.body);
}
