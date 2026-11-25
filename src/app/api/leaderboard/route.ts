import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leaderboardEntries, leaderboardHistory, profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { hasPermission } from "@/lib/perms";
import { avatarUrl } from "@/lib/home-data";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";

export const dynamic = "force-dynamic";

const GAMES = ["Roblox", "Minecraft", "Free Fire"];

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const gameParam = url.searchParams.get("game");
  const game = gameParam && GAMES.includes(gameParam) ? gameParam : "Roblox";
  const [entryRows, canManage] = await Promise.all([
    db
      .select({
        userId: leaderboardEntries.userId,
        points: leaderboardEntries.points,
        updatedAt: leaderboardEntries.updatedAt,
        displayName: profiles.displayName,
        username: profiles.username,
        role: profiles.role,
        avatarUploadId: profiles.avatarUploadId,
      })
      .from(leaderboardEntries)
      .innerJoin(profiles, eq(profiles.id, leaderboardEntries.userId))
      .where(eq(leaderboardEntries.game, game))
      .orderBy(desc(leaderboardEntries.points), sql`${leaderboardEntries.updatedAt} asc`)
      .limit(100),
    hasPermission(viewer, "manage_leaderboard"),
  ]);
  const entries = entryRows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    points: row.points,
    displayName: row.displayName,
    username: row.username,
    role: row.role,
    avatarUrl: avatarUrl(row.avatarUploadId),
  }));
  const myRank = entries.find((entry) => entry.userId === viewer.id) ?? null;
  const history = canManage
    ? await db
        .select({
          id: leaderboardHistory.id,
          delta: leaderboardHistory.delta,
          pointsAfter: leaderboardHistory.pointsAfter,
          reason: leaderboardHistory.reason,
          game: leaderboardHistory.game,
          createdAt: leaderboardHistory.createdAt,
          playerName: profiles.displayName,
        })
        .from(leaderboardHistory)
        .innerJoin(profiles, eq(profiles.id, leaderboardHistory.userId))
        .orderBy(desc(leaderboardHistory.createdAt))
        .limit(40)
    : [];
  return Response.json(
    {
      game,
      games: GAMES,
      entries,
      myRank,
      canManage,
      history: history.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  if (!(await hasPermission(viewer, "manage_leaderboard"))) return fail("forbidden", 403);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 20);
  const game = GAMES.includes(stringField(input.game, 20)) ? stringField(input.game, 20) : "Roblox";
  const userId = stringField(input.userId, 60);
  if (!userId) return fail("member_required", 422);

  if (action === "remove") {
    await db.delete(leaderboardEntries).where(and(eq(leaderboardEntries.game, game), eq(leaderboardEntries.userId, userId)));
    await audit({ actorId: viewer.id, action: "leaderboard.remove", targetType: "leaderboard", targetId: `${game}:${userId}` });
    return Response.json({ ok: true });
  }

  const mode = stringField(input.mode, 10) === "set" ? "set" : "delta";
  const amount = Math.round(Number(input.amount ?? 0));
  if (!Number.isFinite(amount)) return fail("invalid_amount", 422);
  const reason = stringField(input.reason, 200);
  if (reason.length < 3) return fail("reason_required", 422);
  const existing = await db
    .select()
    .from(leaderboardEntries)
    .where(and(eq(leaderboardEntries.game, game), eq(leaderboardEntries.userId, userId)))
    .limit(1);
  const before = existing[0]?.points ?? 0;
  const after = Math.max(mode === "set" ? amount : before + amount, 0);
  await db
    .insert(leaderboardEntries)
    .values({ game, userId, points: after, updatedBy: viewer.id })
    .onConflictDoUpdate({ target: [leaderboardEntries.game, leaderboardEntries.userId], set: { points: after, updatedBy: viewer.id, updatedAt: new Date() } });
  await db.insert(leaderboardHistory).values({ game, userId, delta: after - before, pointsAfter: after, reason, actorId: viewer.id });
  await notifyUsers({ userIds: [userId], kind: "group", title: `Leaderboard updated (${game})`, body: `${after - before >= 0 ? "+" : ""}${after - before} points · ${reason}`, href: `/leaderboard/${game.toLowerCase().replace(" ", "-")}` });
  await audit({ actorId: viewer.id, action: "leaderboard.update", targetType: "leaderboard", targetId: `${game}:${userId}`, detail: `${before} -> ${after} (${reason})` });
  return Response.json({ ok: true, points: after });
}
