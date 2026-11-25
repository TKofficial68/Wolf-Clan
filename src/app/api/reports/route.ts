import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { profiles, reports } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { hasPermission } from "@/lib/perms";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";

export const dynamic = "force-dynamic";

const REASONS = ["SPAM", "HARASSMENT", "INAPPROPRIATE", "OTHER"];
const STATUSES = ["OPEN", "REVIEWING", "RESOLVED", "REJECTED"];

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "queue" ? "queue" : "mine";
  const moderator = viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "view_reports"));
  if (scope === "queue" && !moderator) return fail("forbidden", 403);
  const rows = await db
    .select({
      report: reports,
      reporterName: profiles.displayName,
      reporterAvatar: profiles.avatarUploadId,
      reporterRole: profiles.role,
    })
    .from(reports)
    .innerJoin(profiles, eq(profiles.id, reports.reporterId))
    .where(scope === "queue" ? or(eq(reports.status, "OPEN"), eq(reports.status, "REVIEWING"))! : eq(reports.reporterId, viewer.id))
    .orderBy(desc(reports.createdAt))
    .limit(100);
  return Response.json(
    {
      canModerate: moderator,
      items: rows.map((row) => ({
        id: row.report.id,
        targetType: row.report.targetType,
        targetId: row.report.targetId,
        reason: row.report.reason,
        detail: row.report.detail,
        snapshot: row.report.snapshot,
        status: row.report.status,
        moderatorNote: row.report.moderatorNote,
        createdAt: new Date(row.report.createdAt).toISOString(),
        reporter: { id: row.report.reporterId, displayName: row.reporterName, role: row.reporterRole, avatarUrl: row.reporterAvatar ? `/api/uploads/${row.reporterAvatar}` : null },
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 20);

  if (action === "create") {
    const targetType = stringField(input.targetType, 30);
    const targetId = stringField(input.targetId, 80);
    const reason = REASONS.includes(stringField(input.reason, 20)) ? stringField(input.reason, 20) : "OTHER";
    const detail = stringField(input.detail, 600);
    if (!targetType || !targetId) return fail("target_required", 422);
    const inserted = await db
      .insert(reports)
      .values({ reporterId: viewer.id, targetType, targetId, reason, detail, snapshot: stringField(input.snapshot, 400) || null })
      .returning({ id: reports.id });
    const moderators = await db.select({ id: profiles.id, role: profiles.role }).from(profiles);
    await notifyUsers({
      userIds: moderators.filter((row) => row.role === "OWNER" || row.role === "ADMIN").map((row) => row.id),
      kind: "moderation",
      title: "New report",
      body: `${targetType} · ${reason}`,
      href: "/reports",
    });
    await audit({ actorId: viewer.id, action: "report.create", targetType, targetId, detail: reason });
    return Response.json({ ok: true, id: inserted[0].id });
  }

  if (action === "status") {
    if (!(viewer.role === "OWNER" || viewer.role === "ADMIN" || (await hasPermission(viewer, "resolve_reports")))) return fail("forbidden", 403);
    const reportId = stringField(input.reportId, 60);
    const status = STATUSES.includes(stringField(input.status, 20)) ? stringField(input.status, 20) : "REVIEWING";
    const note = stringField(input.note, 600);
    if (!reportId) return fail("report_required", 422);
    await db
      .update(reports)
      .set({ status, moderatorNote: note || null, resolvedBy: viewer.id, resolvedAt: status === "OPEN" ? null : new Date() })
      .where(eq(reports.id, reportId));
    const report = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
    if (report[0]) {
      await notifyUsers({ userIds: [report[0].reporterId], kind: "moderation", title: `Your report is ${status.toLowerCase()}`, body: note || report[0].reason, href: "/reports" });
    }
    await audit({ actorId: viewer.id, action: "report.status", targetType: "report", targetId: reportId, detail: status });
    return Response.json({ ok: true });
  }

  return fail("unknown_action", 400);
}
