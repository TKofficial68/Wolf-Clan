import { and, asc, count, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  directConversations,
  groupMembers,
  groupMessages,
  groups,
  profiles,
  userPresence,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { requireGroup } from "@/lib/chat-server";
import { loadMediaMap } from "@/lib/media-server";
import { avatarUrl } from "@/lib/home-data";
import { notifyUsers } from "@/lib/notify";
import { hasPermission } from "@/lib/perms";
import type { ChatMember } from "@/lib/chat-types";
import type { MediaItem } from "@/lib/media-types";

export const dynamic = "force-dynamic";

const ACCENTS = ["blue", "purple", "pink", "red", "green", "amber", "teal", "orange"];
const ICONS = ["announce", "review", "minecraft", "freefire", "meeting", "other-games", "editing", "video-ideas", "people"];
const ONLINE_MS = 90_000;

export type GroupListItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  accent: string;
  icon: string;
  memberCount: number;
  onlineCount: number;
  unread: number;
  favorite: boolean;
  pinned: boolean;
  isMember: boolean;
  postRestricted: boolean;
};

export type GroupDetail = {
  group: GroupListItem;
  members: ChatMember[];
  files: MediaItem[];
  canManage: boolean;
  canModerate: boolean;
  isMember: boolean;
  groupRole: string;
  createdAt: string;
  canPost: boolean;
  postBlockedReason: string | null;
};

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const search = (url.searchParams.get("q") ?? "").slice(0, 80);
  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine";
  const moderator = viewer.role === "OWNER" || viewer.role === "ADMIN";

  if (id) {
    try {
      const access = await requireGroup(viewer, id);
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
      const members: ChatMember[] = memberRows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        username: row.username,
        role: row.role,
        title: row.title,
        avatarUrl: avatarUrl(row.avatarUploadId),
        online: row.onlineVisibility === "everyone" && row.presenceStatus === "online" && row.presenceSeen !== null && Date.now() - new Date(row.presenceSeen).getTime() < ONLINE_MS,
        groupRole: row.groupRole,
        mutedUntil: row.mutedUntil ? new Date(row.mutedUntil).toISOString() : null,
      }));

      const fileRows = await db
        .select({ mediaId: groupMessages.mediaId, createdAt: groupMessages.createdAt, senderId: groupMessages.senderId, displayName: profiles.displayName })
        .from(groupMessages)
        .innerJoin(profiles, eq(profiles.id, groupMessages.senderId))
        .where(and(eq(groupMessages.groupId, id), sql`${groupMessages.mediaId} is not null`, sql`${groupMessages.deletedAt} is null`))
        .orderBy(desc(groupMessages.createdAt))
        .limit(120);
      const mediaMap = await loadMediaMap(fileRows.map((row) => row.mediaId));
      const files: MediaItem[] = fileRows.reduce<MediaItem[]>((list, row) => {
        const item = row.mediaId ? mediaMap.get(row.mediaId) : undefined;
        if (item) list.push({ ...item, senderName: row.displayName, senderId: row.senderId });
        return list;
      }, []);

      const unreadRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(groupMessages)
        .where(
          and(
            eq(groupMessages.groupId, id),
            ne(groupMessages.senderId, viewer.id),
            access.member.lastReadAt ? gt(groupMessages.createdAt, access.member.lastReadAt) : sql`true`,
          ),
        );

      const detail: GroupDetail = {
        group: {
          id: access.group.id,
          slug: access.group.slug,
          name: access.group.name,
          description: access.group.description,
          accent: access.group.accent,
          icon: access.group.icon,
          memberCount: members.length,
          onlineCount: members.filter((member) => member.online).length,
          unread: unreadRows[0]?.count ?? 0,
          favorite: Boolean(access.member.favoritedAt),
          pinned: Boolean(access.member.pinnedAt),
          isMember: true,
          postRestricted: access.group.postRestricted,
        },
        members,
        files,
        canManage: access.canModerate,
        canModerate: access.canModerate,
        isMember: true,
        groupRole: access.member.groupRole,
        createdAt: new Date(access.group.createdAt).toISOString(),
        canPost: access.canPost,
        postBlockedReason: access.blockedReason,
      };
      return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return fail("not_found", 404);
    }
  }

  const memberships = await db.select().from(groupMembers).where(eq(groupMembers.userId, viewer.id));
  const memberGroupIds = memberships.map((row) => row.groupId);

  const groupRows = await db
    .select()
    .from(groups)
    .where(
      and(
        scope === "mine" || !moderator ? inArray(groups.id, memberGroupIds.length ? memberGroupIds : ["00000000-0000-0000-0000-000000000000"]) : sql`true`,
        search ? sql`(${groups.name} ilike ${`%${search}%`} or ${groups.description} ilike ${`%${search}%`})` : sql`true`,
      ),
    )
    .orderBy(desc(groups.isSystem), asc(groups.name));

  const ids = groupRows.map((row) => row.id);
  const memberCounts = ids.length
    ? await db.select({ groupId: groupMembers.groupId, total: count() }).from(groupMembers).where(inArray(groupMembers.groupId, ids)).groupBy(groupMembers.groupId)
    : [];
  const onlineCounts = ids.length
    ? await db
        .select({ groupId: groupMembers.groupId, total: count() })
        .from(groupMembers)
        .innerJoin(userPresence, eq(userPresence.userId, groupMembers.userId))
        .innerJoin(profiles, eq(profiles.id, groupMembers.userId))
        .where(
          and(
            inArray(groupMembers.groupId, ids),
            eq(userPresence.status, "online"),
            gt(userPresence.lastSeenAt, new Date(Date.now() - ONLINE_MS)),
            eq(profiles.onlineVisibility, "everyone"),
          ),
        )
        .groupBy(groupMembers.groupId)
    : [];
  const lastMessages = ids.length
    ? await db
        .select({ groupId: groupMessages.groupId, createdAt: groupMessages.createdAt })
        .from(groupMessages)
        .where(inArray(groupMessages.groupId, ids))
        .orderBy(desc(groupMessages.createdAt))
        .limit(400)
    : [];

  const unreadByGroup = new Map<string, number>();
  for (const membership of memberships) {
    const rows = await db
      .select({ total: count() })
      .from(groupMessages)
      .where(
        and(
          eq(groupMessages.groupId, membership.groupId),
          ne(groupMessages.senderId, viewer.id),
          membership.lastReadAt ? gt(groupMessages.createdAt, membership.lastReadAt) : sql`true`,
        ),
      );
    unreadByGroup.set(membership.groupId, Number(rows[0]?.total ?? 0));
  }

  const items: (GroupListItem & { lastMessageAt: string | null })[] = groupRows.map((group) => {
    const membership = memberships.find((row) => row.groupId === group.id);
    const last = lastMessages.find((row) => row.groupId === group.id);
    return {
      id: group.id,
      slug: group.slug,
      name: group.name,
      description: group.description,
      accent: group.accent,
      icon: group.icon,
      memberCount: Number(memberCounts.find((row) => row.groupId === group.id)?.total ?? 0),
      onlineCount: Number(onlineCounts.find((row) => row.groupId === group.id)?.total ?? 0),
      unread: unreadByGroup.get(group.id) ?? 0,
      favorite: Boolean(membership?.favoritedAt),
      pinned: Boolean(membership?.pinnedAt),
      isMember: Boolean(membership),
      postRestricted: group.postRestricted,
      lastMessageAt: last ? new Date(last.createdAt).toISOString() : null,
    };
  });

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return 0;
  });

  return Response.json(
    { items, canCreate: moderator, isModerator: moderator, scope },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 30);
  const groupId = stringField(input.groupId ?? input.id, 60);
  const moderator = viewer.role === "OWNER" || viewer.role === "ADMIN";

  if (action === "create") {
    if (!moderator) return fail("forbidden", 403);
    const name = stringField(input.name, 60);
    const description = stringField(input.description, 200);
    const accent = ACCENTS.includes(stringField(input.accent, 20)) ? stringField(input.accent, 20) : "blue";
    const icon = ICONS.includes(stringField(input.icon, 20)) ? stringField(input.icon, 20) : "people";
    const memberIds = Array.isArray(input.memberIds) ? input.memberIds.filter((value): value is string => typeof value === "string").slice(0, 40) : [];
    if (name.length < 2) return fail("invalid_name", 422);
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "group";
    let slug = slugBase;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, slug)).limit(1);
      if (!exists.length) break;
      slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const inserted = await db
      .insert(groups)
      .values({ slug, name, description, accent, icon, createdBy: viewer.id })
      .returning({ id: groups.id });
    const id = inserted[0].id;
    const validMembers = memberIds.length
      ? await db.select({ id: profiles.id }).from(profiles).where(inArray(profiles.id, memberIds.slice(0, 40)))
      : [];
    await db.insert(groupMembers).values([
      { groupId: id, userId: viewer.id, groupRole: "MODERATOR", addedBy: viewer.id },
      ...validMembers.filter((row) => row.id !== viewer.id).map((row) => ({ groupId: id, userId: row.id, groupRole: "MEMBER", addedBy: viewer.id })),
    ]);
    await db.insert(directConversations).values({}).returning({ id: directConversations.id }).catch(() => undefined);
    if (validMembers.length) {
      await notifyUsers({
        userIds: validMembers.map((row) => row.id),
        kind: "group",
        title: `${viewer.displayName} added you to ${name}`,
        href: `/groups/${id}`,
      });
    }
    return Response.json({ ok: true, id });
  }

  if (!groupId) return fail("group_required", 422);
  const groupRows = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const group = groupRows[0];
  if (!group) return fail("not_found", 404);
  const memberRows = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)))
    .limit(1);
  const membership = memberRows[0];
  const canManage = Boolean(membership) && (moderator || membership.groupRole === "MODERATOR" || (await hasPermission(viewer, "manage_group_members")));

  if (action === "update") {
    if (!canManage) return fail("forbidden", 403);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof input.name === "string") {
      const name = stringField(input.name, 60);
      if (name.length < 2) return fail("invalid_name", 422);
      patch.name = name;
    }
    if (typeof input.description === "string") patch.description = stringField(input.description, 200);
    if (typeof input.accent === "string" && ACCENTS.includes(input.accent)) patch.accent = input.accent;
    if (typeof input.icon === "string" && ICONS.includes(input.icon)) patch.icon = input.icon;
    if (typeof input.postRestricted === "boolean") patch.postRestricted = input.postRestricted;
    await db.update(groups).set(patch).where(eq(groups.id, groupId));
    return Response.json({ ok: true });
  }

  if (action === "delete") {
    if (!moderator) return fail("forbidden", 403);
    if (stringField(input.confirmName, 80) !== group.name) return fail("confirm_mismatch", 422);
    await db.delete(groups).where(eq(groups.id, groupId));
    return Response.json({ ok: true });
  }

  if (action === "add-member" || action === "addMembers") {
    if (!canManage) return fail("forbidden", 403);
    const ids = Array.isArray(input.userIds)
      ? input.userIds.filter((value): value is string => typeof value === "string")
      : [stringField(input.userId, 60)].filter(Boolean);
    if (!ids.length) return fail("member_required", 422);
    const existing = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
    const fresh = ids.filter((id) => !existing.some((row) => row.userId === id));
    const valid = fresh.length ? await db.select({ id: profiles.id }).from(profiles).where(inArray(profiles.id, fresh)) : [];
    if (valid.length) {
      await db.insert(groupMembers).values(valid.map((row) => ({ groupId, userId: row.id, groupRole: "MEMBER", addedBy: viewer.id }))).onConflictDoNothing();
      await notifyUsers({ userIds: valid.map((row) => row.id), kind: "group", title: `${viewer.displayName} added you to ${group.name}`, href: `/groups/${groupId}` });
    }
    return Response.json({ ok: true, added: valid.length });
  }

  if (action === "remove-member") {
    if (!canManage) return fail("forbidden", 403);
    const userId = stringField(input.userId, 60);
    if (userId === group.createdBy) return fail("cannot_remove_creator", 422);
    await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    await notifyUsers({ userIds: [userId], kind: "group", title: `You were removed from ${group.name}`, href: "/groups" });
    return Response.json({ ok: true });
  }

  if (action === "mute") {
    const userId = stringField(input.userId, 60) || viewer.id;
    if (userId !== viewer.id && !canManage) return fail("forbidden", 403);
    const hours = Number(input.hours ?? 0);
    const until = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000) : null;
    await db
      .update(groupMembers)
      .set({ mutedUntil: until })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    return Response.json({ ok: true, mutedUntil: until ? until.toISOString() : null });
  }

  if (action === "role") {
    if (!canManage) return fail("forbidden", 403);
    const userId = stringField(input.userId, 60);
    const role = input.role === "MODERATOR" ? "MODERATOR" : "MEMBER";
    await db.update(groupMembers).set({ groupRole: role }).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    return Response.json({ ok: true });
  }

  if (action === "favorite" || action === "pin") {
    if (!membership) return fail("not_a_member", 403);
    const value = input.value === true;
    await db
      .update(groupMembers)
      .set(action === "favorite" ? { favoritedAt: value ? new Date() : null } : { pinnedAt: value ? new Date() : null })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)));
    return Response.json({ ok: true });
  }

  if (action === "leave") {
    if (!membership) return fail("not_a_member", 403);
    const others = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, groupId), ne(groupMembers.userId, viewer.id)));
    if (group.createdBy === viewer.id) {
      if (!others.length) return fail("creator_last_member", 422);
      const next = others.find((row) => row.groupRole === "MODERATOR") ?? others[0];
      await db.update(groupMembers).set({ groupRole: "MODERATOR" }).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, next.userId)));
      await db.update(groups).set({ createdBy: next.userId }).where(eq(groups.id, groupId));
    }
    await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, viewer.id)));
    return Response.json({ ok: true });
  }

  if (action === "join") {
    if (membership) return Response.json({ ok: true });
    await db.insert(groupMembers).values({ groupId, userId: viewer.id, groupRole: "MEMBER" }).onConflictDoNothing();
    return Response.json({ ok: true });
  }

  return fail("unknown_action", 400);
}
