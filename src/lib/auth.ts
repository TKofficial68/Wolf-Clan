import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { authAttempts, profiles, sessions } from "@/db/schema";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = "wolf_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const key = await scrypt(password, salt, expected.length);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  title: string | null;
  bio: string | null;
  avatarUploadId: string | null;
  bannerUploadId: string | null;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  onlineVisibility: string;
  lastSeenVisibility: string;
  profileVisibility: string;
  bannedAt: Date | null;
  banReason: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  sessionId: string;
};

export async function createSession(userId: string, userAgent: string | null, ip: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.insert(sessions).values({ userId, tokenHash: sha256(token), userAgent, ip, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      sessionId: sessions.id,
      id: profiles.id,
      email: profiles.email,
      username: profiles.username,
      displayName: profiles.displayName,
      role: profiles.role,
      title: profiles.title,
      bio: profiles.bio,
      avatarUploadId: profiles.avatarUploadId,
      bannerUploadId: profiles.bannerUploadId,
      emailVerified: profiles.emailVerified,
      onboardingCompleted: profiles.onboardingCompleted,
      onlineVisibility: profiles.onlineVisibility,
      lastSeenVisibility: profiles.lastSeenVisibility,
      profileVisibility: profiles.profileVisibility,
      bannedAt: profiles.bannedAt,
      banReason: profiles.banReason,
      createdAt: profiles.createdAt,
      lastSeenAt: profiles.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(profiles, eq(profiles.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.bannedAt) redirect("/blocked");
  return user;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
  }
  store.delete(SESSION_COOKIE);
}

export async function revokeOtherSessions(userId: string, sessionId: string): Promise<number> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), ne(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return result.length;
}

export async function countRecentAttempts(kind: string, key: string, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(authAttempts)
    .where(and(eq(authAttempts.kind, kind), eq(authAttempts.key, key), gt(authAttempts.createdAt, since)));
  return rows[0]?.count ?? 0;
}

export async function recordAttempt(kind: string, key: string): Promise<void> {
  await db.insert(authAttempts).values({ kind, key });
}
