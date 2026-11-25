import { getSessionUser } from "@/lib/auth";
import { cronAuthorized } from "@/lib/env";
import { runMonthlyChatCleanup, runOrphanSweep, runPresenceSweep, runReminders, runTempCleanup, runTombstonePrune, retryHardDeleteJobs } from "@/lib/cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, ctx: { params: Promise<{ job: string }> }) {
  const { job } = await ctx.params;
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  let allowed = cronAuthorized(request);
  if (!allowed) {
    const viewer = await getSessionUser();
    allowed = Boolean(viewer && viewer.role === "OWNER");
  }
  if (!allowed) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  switch (job) {
    case "temp":
      return Response.json({ ok: true, result: await runTempCleanup(dryRun) });
    case "monthly":
      return Response.json({ ok: true, result: await runMonthlyChatCleanup(dryRun) });
    case "reminders":
      return Response.json({ ok: true, result: await runReminders(dryRun) });
    case "presence":
      return Response.json({ ok: true, result: await runPresenceSweep(dryRun) });
    case "tombstones":
      return Response.json({ ok: true, result: await runTombstonePrune(dryRun) });
    case "orphans":
      return Response.json({ ok: true, result: await runOrphanSweep(dryRun) });
    case "retry":
      return Response.json({ ok: true, result: await retryHardDeleteJobs() });
    case "all": {
      const results = [await runTempCleanup(dryRun), await runPresenceSweep(dryRun), await runReminders(dryRun)];
      return Response.json({ ok: true, results });
    }
    default:
      return Response.json({ ok: false, error: "unknown_job" }, { status: 404 });
  }
}

export const POST = GET;
