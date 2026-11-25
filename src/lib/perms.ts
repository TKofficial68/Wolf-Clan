import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, rolePermissions, userPermissions } from "@/db/schema";
import type { SessionUser } from "./auth";

export const CAPABILITIES = [
  "post_announcement",
  "delete_any_message",
  "delete_messages",
  "create_group",
  "manage_groups",
  "manage_group_members",
  "manage_members",
  "pin_messages",
  "ban_users",
  "moderate_reviews",
  "post_review",
  "create_task",
  "create_tasks",
  "assign_tasks",
  "manage_tasks",
  "manage_projects",
  "manage_meetings",
  "create_meeting",
  "mute_participant",
  "manage_screen_share",
  "view_reports",
  "resolve_reports",
  "manage_files",
  "manage_leaderboard",
  "hard_delete_any",
  "view_audit",
] as const;

/** Matrix names that mean the same thing as an existing capability. */
const ALIASES: Record<string, string[]> = {
  delete_messages: ["delete_messages", "delete_any_message"],
  pin_messages: ["pin_messages"],
  create_tasks: ["create_tasks", "create_task"],
  create_meeting: ["create_meeting", "manage_meetings"],
  view_reports: ["view_reports", "moderate_reviews"],
  resolve_reports: ["resolve_reports", "moderate_reviews"],
  manage_files: ["manage_files"],
};

export type Capability = (typeof CAPABILITIES)[number];

const ROLE_DEFAULTS: Record<string, Capability[]> = {
  OWNER: [...CAPABILITIES],
  ADMIN: [
    "post_announcement",
    "delete_any_message",
    "delete_messages",
    "create_group",
    "manage_groups",
    "manage_group_members",
    "manage_members",
    "pin_messages",
    "ban_users",
    "moderate_reviews",
    "post_review",
    "create_task",
    "create_tasks",
    "assign_tasks",
    "manage_tasks",
    "manage_projects",
    "manage_meetings",
    "create_meeting",
    "mute_participant",
    "manage_screen_share",
    "view_reports",
    "resolve_reports",
    "manage_files",
    "manage_leaderboard",
    "view_audit",
  ],
  MEMBER: ["post_review"],
};

export function capabilityLabelKey(capability: Capability): string {
  return `caps.${capability}`;
}

export async function getCapabilities(user: Pick<SessionUser, "id" | "role">): Promise<Capability[]> {
  if (user.role === "OWNER") return [...CAPABILITIES];
  const [roleRows, userRows] = await Promise.all([
    db.select().from(rolePermissions).where(eq(rolePermissions.role, user.role)),
    db.select().from(userPermissions).where(eq(userPermissions.userId, user.id)),
  ]);
  const base = new Set<Capability>(ROLE_DEFAULTS[user.role] ?? ROLE_DEFAULTS.MEMBER);
  for (const row of roleRows) {
    const capability = row.capability as Capability;
    if (!CAPABILITIES.includes(capability)) continue;
    if (row.allowed) base.add(capability);
    else base.delete(capability);
  }
  for (const row of userRows) {
    const capability = row.capability as Capability;
    if (!CAPABILITIES.includes(capability)) continue;
    if (row.allowed) base.add(capability);
    else base.delete(capability);
  }
  return Array.from(base);
}

export async function hasPermission(
  user: Pick<SessionUser, "id" | "role">,
  capability: Capability | string,
): Promise<boolean> {
  if (user.role === "OWNER") return true;
  const capabilities = await getCapabilities(user);
  const names = ALIASES[capability] ?? [capability];
  return names.some((name) => capabilities.includes(name as Capability));
}

export async function hasAnyPermission(
  user: Pick<SessionUser, "id" | "role">,
  capabilities: (Capability | string)[],
): Promise<boolean> {
  for (const capability of capabilities) {
    if (await hasPermission(user, capability)) return true;
  }
  return false;
}

export async function canDeleteContent(
  viewer: Pick<SessionUser, "id" | "role">,
  owner: { id: string; role: string },
): Promise<boolean> {
  if (owner.id === viewer.id) return true;
  if (owner.role === "OWNER" && viewer.role !== "OWNER") return false;
  return hasPermission(viewer, "hard_delete_any");
}

export async function setUserPermission(
  actorId: string,
  userId: string,
  capability: Capability,
  allowed: boolean,
): Promise<void> {
  await db
    .insert(userPermissions)
    .values({ userId, capability, allowed, updatedBy: actorId })
    .onConflictDoUpdate({
      target: [userPermissions.userId, userPermissions.capability],
      set: { allowed, updatedBy: actorId, updatedAt: new Date() },
    });
}

export async function setRolePermission(role: string, capability: Capability, allowed: boolean): Promise<void> {
  await db
    .insert(rolePermissions)
    .values({ role, capability, allowed })
    .onConflictDoUpdate({ target: [rolePermissions.role, rolePermissions.capability], set: { allowed } });
}

export async function userPermissionOverrides(userId: string) {
  return db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
}

export async function rolePermissionRows() {
  return db.select().from(rolePermissions);
}

export async function ownerCount(): Promise<number> {
  const rows = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.role, "OWNER"));
  return rows.length;
}
