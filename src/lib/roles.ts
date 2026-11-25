export type Role = "OWNER" | "ADMIN" | "MEMBER";

export const ROLE_RANK: Record<Role, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

export function isRole(value: string): value is Role {
  return value === "OWNER" || value === "ADMIN" || value === "MEMBER";
}

export function roleColor(role: string): string {
  if (role === "OWNER") return "var(--owner)";
  if (role === "ADMIN") return "var(--admin)";
  return "var(--gold)";
}

/** Optional extra labels stored in profiles.title, e.g. Editor or Manager. */
export function titleAccent(title: string | null): string | null {
  if (!title) return null;
  const key = title.trim().toLowerCase();
  if (key === "editor") return "var(--editor)";
  if (key === "manager") return "var(--manager)";
  return null;
}

export function canManageAnnouncements(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export const APP = {
  name: "Wolf Clan",
  version: "0.1.0",
  developer: "Mr TK",
  studio: "TK OFFICIAL",
  developerEmail: "tkofficial68@gmail.com",
} as const;
