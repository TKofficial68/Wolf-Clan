import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  announcementReads,
  announcements,
  directConversationMembers,
  directMessages,
  profiles,
  userBlocks,
  userPresence,
} from "@/db/schema";
import type { SessionUser } from "./auth";

export type HomeMember = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  title: string | null;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
  showLastSeen: boolean;
  conversationId: string | null;
  lastMessage: { body: string; createdAt: string; mine: boolean; status: string; kind: string } | null;
  unread: number;
  pinned: boolean;
  favorite: boolean;
  blockedByMe: boolean;
  blockedMe: boolean;
};

export type HomeData = {
  me: { id: string; displayName: string; username: string; role: string; title: string | null; avatarUrl: string | null };
  owner: HomeMember | null;
  members: HomeMember[];
  counts: { online: number; offline: number; total: number };
  unreadAnnouncements: number;
  bannerUrl: string | null;
  canManageAnnouncements: boolean;
  serverTime: string;
};

export function avatarUrl(id: string | null | undefined): string | null {
  return id ? `/api/uploads/${id}` : null;
}

const ONLINE_WINDOW_MS = 90_000;

export function isOnline(status: string | null, seen: Date | string | null): boolean {
  if (!status || status !== "online" || !seen) return false;
  const at = typeof seen === "string" ? new Date(seen) : seen;
  return Date.now() - at.getTime() < ONLINE_WINDOW_MS;
}

export async function loadHomeData(viewer: SessionUser): Promise<HomeData> {
  const others = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      role: profiles.role,
      title: profiles.title,
      avatarUploadId: profiles.avatarUploadId,
      bannerUploadId: profiles.bannerUploadId,
      lastSeenAt: profiles.lastSeenAt,
      onlineVisibility: profiles.onlineVisibility,
      lastSeenVisibility: profiles.lastSeenVisibility,
      presenceStatus: userPresence.status,
      presenceSeen: userPresence.lastSeenAt,
    })
    .from(profiles)
    .leftJoin(userPresence, eq(userPresence.userId, profiles.id))
    .where(ne(profiles.id, viewer.id))
    .orderBy(desc(profiles.role), profiles.displayName);

  const myMemberships = await db
    .select()
    .from(directConversationMembers)
    .where(eq(directConversationMembers.userId, viewer.id));
  const conversationIds = myMemberships.map((m) => m.conversationId);

  const peerMembers = conversationIds.length
    ? await db
        .select()
        .from(directConversationMembers)
        .where(inArray(directConversationMembers.conversationId, conversationIds))
    : [];

  const latest = conversationIds.length
    ? await db
        .select()
        .from(directMessages)
        .where(inArray(directMessages.conversationId, conversationIds))
        .orderBy(desc(directMessages.createdAt))
        .limit(200)
    : [];

  const unreadRows = conversationIds.length
    ? await db
        .select({
          conversationId: directMessages.conversationId,
          count: sql<number>`count(*)::int`,
        })
        .from(directMessages)
        .innerJoin(
          directConversationMembers,
          and(
            eq(directConversationMembers.conversationId, directMessages.conversationId),
            eq(directConversationMembers.userId, viewer.id),
          ),
        )
        .where(
          and(
            inArray(directMessages.conversationId, conversationIds),
            ne(directMessages.senderId, viewer.id),
            sql`${directMessages.createdAt} > coalesce(${directConversationMembers.lastReadAt}, to_timestamp(0))`,
          ),
        )
        .groupBy(directMessages.conversationId)
    : [];

  const blockRows = await db
    .select()
    .from(userBlocks)
    .where(or(eq(userBlocks.blockerId, viewer.id), eq(userBlocks.blockedId, viewer.id)));

  const announcementTotal = await db.select({ count: sql<number>`count(*)::int` }).from(announcements);
  const readCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(announcementReads)
    .where(eq(announcementReads.userId, viewer.id));

  const ownerRow = others.find((o) => o.role === "OWNER") ?? null;

  const buildMember = (row: (typeof others)[number]): HomeMember => {
    const peer = peerMembers.find((m) => m.userId === row.id);
    const conversationId = peer?.conversationId ?? null;
    const membership = myMemberships.find((m) => m.conversationId === conversationId) ?? null;
    const last = conversationId ? latest.find((m) => m.conversationId === conversationId) : undefined;
    const unread = unreadRows.find((u) => u.conversationId === conversationId)?.count ?? 0;
    const online = row.onlineVisibility === "everyone" && isOnline(row.presenceStatus, row.presenceSeen);
    const showLastSeen = row.lastSeenVisibility === "everyone";
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      title: row.title,
      avatarUrl: avatarUrl(row.avatarUploadId),
      online,
      lastSeenAt: row.presenceSeen ? new Date(row.presenceSeen).toISOString() : null,
      showLastSeen,
      conversationId,
      lastMessage: last
        ? {
            body: last.body ?? (last.kind && last.kind !== "text" ? `[${last.kind}]` : ""),
            kind: last.kind,
            createdAt: new Date(last.createdAt).toISOString(),
            mine: last.senderId === viewer.id,
            status: last.status,
          }
        : null,
      unread,
      pinned: Boolean(membership?.pinnedAt),
      favorite: Boolean(membership?.favoritedAt),
      blockedByMe: blockRows.some((b) => b.blockerId === viewer.id && b.blockedId === row.id),
      blockedMe: blockRows.some((b) => b.blockerId === row.id && b.blockedId === viewer.id),
    };
  };

  const mapped = others.map(buildMember);
  const members = mapped
    .filter((m) => m.role !== "OWNER")
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.displayName.localeCompare(b.displayName);
    });

  const total = others.length + 1;
  const online = others.filter((m) => m.onlineVisibility === "everyone" && isOnline(m.presenceStatus, m.presenceSeen)).length + 1;

  return {
    me: {
      id: viewer.id,
      displayName: viewer.displayName,
      username: viewer.username,
      role: viewer.role,
      title: viewer.title,
      avatarUrl: avatarUrl(viewer.avatarUploadId),
    },
    owner: ownerRow ? buildMember(ownerRow) : null,
    members,
    counts: { online, offline: Math.max(total - online, 0), total },
    unreadAnnouncements: Math.max((announcementTotal[0]?.count ?? 0) - (readCount[0]?.count ?? 0), 0),
    bannerUrl: avatarUrl(ownerRow?.bannerUploadId),
    canManageAnnouncements: viewer.role === "OWNER" || viewer.role === "ADMIN",
    serverTime: new Date().toISOString(),
  };
}

export async function getTeamBannerUrl(): Promise<string | null> {
  const rows = await db
    .select({ bannerUploadId: profiles.bannerUploadId })
    .from(profiles)
    .where(eq(profiles.role, "OWNER"))
    .limit(1);
  return avatarUrl(rows[0]?.bannerUploadId);
}
