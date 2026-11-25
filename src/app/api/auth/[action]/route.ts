import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailTokens, groupInvites, ownerSettings, profiles, sessions, teamApprovals, userSettings } from "@/db/schema";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  countRecentAttempts,
  createSession,
  hashPassword,
  recordAttempt,
  revokeCurrentSession,
  revokeOtherSessions,
  sha256,
  verifyPassword,
  getSessionUser,
} from "@/lib/auth";
import { appBaseUrl, mailConfigured, sendMail } from "@/lib/email";
import { body, clientIp, fail, isEmail, normalizeUsername, stringField, validUsername } from "@/lib/http";

export const dynamic = "force-dynamic";

const TEN_MIN = 10 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

async function issueToken(userId: string, kind: "verify" | "reset"): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (kind === "reset" ? ONE_HOUR : 24 * ONE_HOUR));
  await db.insert(emailTokens).values({ userId, kind, tokenHash: sha256(token), expiresAt });
  return token;
}

async function verifyEmailToken(token: string, kind: "verify" | "reset") {
  const rows = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, sha256(token)), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const ip = clientIp(request);

  if (action === "register") {
    const input = await body<Record<string, unknown>>(request);
    const email = stringField(input.email, 254).toLowerCase();
    const password = typeof input.password === "string" ? input.password : "";
    const confirm = typeof input.confirmPassword === "string" ? input.confirmPassword : "";
    const displayName = stringField(input.displayName, 60);
    const username = normalizeUsername(stringField(input.username, 30));
    const inviteCode = stringField(input.inviteCode, 40).toUpperCase();

    if ((await countRecentAttempts("register", ip, ONE_HOUR)) >= 8) return fail("rate_limited", 429);
    await recordAttempt("register", ip);

    if (!isEmail(email)) return fail("invalid_email", 422);
    if (displayName.length < 2 || displayName.length > 32) return fail("invalid_name", 422);
    if (!validUsername(username)) return fail("invalid_username", 422);
    if (password.length < 8) return fail("password_short", 422);
    if (password !== confirm) return fail("password_mismatch", 422);

    const modeRows = await db.select({ registrationMode: ownerSettings.registrationMode }).from(ownerSettings).limit(1);
    const registrationMode = modeRows[0]?.registrationMode ?? "open";
    let invite: typeof groupInvites.$inferSelect | undefined;
    if (inviteCode) {
      const rows = await db.select().from(groupInvites).where(eq(groupInvites.code, inviteCode)).limit(1);
      invite = rows[0];
      if (!invite || invite.revokedAt || (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) || (invite.maxUses !== null && invite.uses >= invite.maxUses)) {
        return fail("invite_invalid", 422);
      }
    } else if (registrationMode === "invite_only") {
      return fail("invite_required", 422);
    }

    const existingEmail = await db.select({ id: profiles.id }).from(profiles).where(sql`lower(${profiles.email}) = ${email}`).limit(1);
    if (existingEmail.length) return fail("email_in_use", 409);
    const existingUsername = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, username)).limit(1);
    if (existingUsername.length) return fail("username_taken", 409);

    // New accounts are always Member. Owner accounts are created only by the database seed.
    const role = "MEMBER";
    const passwordHash = await hashPassword(password);
    const needsEmail = mailConfigured();

    const inserted = await db
      .insert(profiles)
      .values({ email, passwordHash, username, displayName, role, emailVerified: !needsEmail })
      .returning({ id: profiles.id });
    const userId = inserted[0].id;
    await db.insert(userSettings).values({ userId });
    if (invite) {
      await db.update(groupInvites).set({ uses: sql`${groupInvites.uses} + 1` }).where(eq(groupInvites.id, invite.id));
    }
    const needsApproval = registrationMode === "open_approval" && !invite;
    if (needsApproval) await db.insert(teamApprovals).values({ userId });

    if (needsEmail) {
      const token = await issueToken(userId, "verify");
      const link = `${appBaseUrl()}/api/auth/verify?token=${token}`;
      const result = await sendMail({
        to: email,
        subject: "Confirm your Wolf Clan email",
        text: `Welcome to Wolf Clan, ${displayName}.\n\nConfirm your email address: ${link}\n\nThis link works for 24 hours.`,
      });
      if (!result.ok) return Response.json({ ok: true, needsVerification: true, mailFailed: true });
      return Response.json({ ok: true, needsVerification: true });
    }

    if (needsApproval) return Response.json({ ok: true, needsApproval: true });
    await createSession(userId, request.headers.get("user-agent"), ip);
    return Response.json({ ok: true, redirect: "/home" });
  }

  if (action === "login") {
    const input = await body<Record<string, unknown>>(request);
    const email = stringField(input.email, 254).toLowerCase();
    const password = typeof input.password === "string" ? input.password : "";
    const attemptKey = `${ip}:${email}`;
    if ((await countRecentAttempts("login", attemptKey, TEN_MIN)) >= 8) return fail("rate_limited", 429);

    if (!isEmail(email) || password.length < 1) {
      await recordAttempt("login", attemptKey);
      return fail("invalid_credentials", 401);
    }
    const rows = await db.select().from(profiles).where(sql`lower(${profiles.email}) = ${email}`).limit(1);
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      await recordAttempt("login", attemptKey);
      return fail("invalid_credentials", 401);
    }
    if (user.bannedAt) {
      return Response.json({ error: "banned", reason: user.banReason }, { status: 403 });
    }
    const approval = await db.select({ status: teamApprovals.status }).from(teamApprovals).where(eq(teamApprovals.userId, user.id)).limit(1);
    if (approval[0]?.status === "PENDING") return fail("pending_approval", 403);
    await createSession(user.id, request.headers.get("user-agent"), ip);
    await db.update(profiles).set({ lastSeenAt: new Date() }).where(eq(profiles.id, user.id));
    return Response.json({ ok: true, redirect: "/home" });
  }

  if (action === "logout") {
    await revokeCurrentSession();
    return Response.json({ ok: true });
  }

  if (action === "logout-others") {
    const user = await getSessionUser();
    if (!user) return fail("unauthorized", 401);
    const count = await revokeOtherSessions(user.id, user.sessionId);
    return Response.json({ ok: true, count });
  }

  if (action === "forgot") {
    const input = await body<Record<string, unknown>>(request);
    const email = stringField(input.email, 254).toLowerCase();
    if (!isEmail(email)) return fail("invalid_email", 422);
    if ((await countRecentAttempts("forgot", ip, ONE_HOUR)) >= 5) return fail("rate_limited", 429);
    await recordAttempt("forgot", ip);
    if (!mailConfigured()) return fail("email_not_configured", 503);

    const rows = await db.select({ id: profiles.id, displayName: profiles.displayName }).from(profiles).where(sql`lower(${profiles.email}) = ${email}`).limit(1);
    if (rows[0]) {
      const token = await issueToken(rows[0].id, "reset");
      const link = `${appBaseUrl()}/reset-password/${token}`;
      const result = await sendMail({
        to: email,
        subject: "Reset your Wolf Clan password",
        text: `Hi ${rows[0].displayName},\n\nReset your password: ${link}\n\nThis link expires in one hour.`,
      });
      if (!result.ok) return fail("email_provider_error", 502);
    }
    return Response.json({ ok: true });
  }

  if (action === "reset") {
    const input = await body<Record<string, unknown>>(request);
    const token = stringField(input.token, 200);
    const password = typeof input.password === "string" ? input.password : "";
    const confirm = typeof input.confirmPassword === "string" ? input.confirmPassword : "";
    if (password.length < 8) return fail("password_short", 422);
    if (password !== confirm) return fail("password_mismatch", 422);
    const record = await verifyEmailToken(token, "reset");
    if (!record) return fail("reset_invalid", 400);
    const passwordHash = await hashPassword(password);
    await db.update(profiles).set({ passwordHash, updatedAt: new Date() }).where(eq(profiles.id, record.userId));
    await db.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, record.id));
    await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, record.userId), isNull(sessions.revokedAt)));
    return Response.json({ ok: true });
  }

  return fail("not_found", 404);
}

export async function GET(request: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;

  if (action === "username") {
    const url = new URL(request.url);
    const username = normalizeUsername(url.searchParams.get("u") ?? "");
    if (!validUsername(username)) return Response.json({ available: false, reason: "invalid" });
    const rows = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, username)).limit(1);
    return Response.json({ available: rows.length === 0 });
  }

  if (action === "verify") {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? "";
    const record = await verifyEmailToken(token, "verify");
    if (!record) return Response.redirect(`${appBaseUrl()}/login?verified=invalid`, 303);
    await db.update(profiles).set({ emailVerified: true }).where(eq(profiles.id, record.userId));
    await db.update(emailTokens).set({ usedAt: new Date() }).where(eq(emailTokens.id, record.id));
    return Response.redirect(`${appBaseUrl()}/login?verified=1`, 303);
  }

  if (action === "me") {
    const user = await getSessionUser();
    if (!user) return fail("unauthorized", 401);
    return Response.json({ id: user.id, onboardingCompleted: user.onboardingCompleted });
  }

  if (action === "logout") {
    await clearSessionCookie();
    return Response.json({ ok: true });
  }

  return fail("not_found", 404);
}

export const runtime = "nodejs";
