import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { hardDeleteJobs } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { body, fail, isUuid, stringField } from "@/lib/http";
import { countContent, runHardDelete, type HardDeleteType } from "@/lib/hard-delete";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES: HardDeleteType[] = ["message", "media", "dm_all", "group_all", "group", "review", "review_media", "task", "project", "announcement", "task_comment", "review_comment", "meeting"];

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (jobId) {
    const rows = await db.select().from(hardDeleteJobs).where(eq(hardDeleteJobs.id, jobId)).limit(1);
    if (!rows[0]) return fail("not_found", 404);
    return Response.json({ job: rows[0] });
  }
  const type = url.searchParams.get("countType") as HardDeleteType | null;
  const targetId = url.searchParams.get("targetId");
  if (type && targetId && TYPES.includes(type)) {
    const counts = await countContent(type, targetId);
    return Response.json({ counts });
  }
  const jobs = await db.select().from(hardDeleteJobs).orderBy(desc(hardDeleteJobs.createdAt)).limit(20);
  return Response.json({ jobs });
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const type = stringField(input.type, 30) as HardDeleteType;
  const targetId = stringField(input.targetId, 80);
  if (!TYPES.includes(type)) return fail("unknown_type", 422);
  if (!targetId) return fail("target_required", 422);
  if (!isUuid(targetId)) return fail("invalid_id", 422);
  const needsTyping = ["group", "project", "task", "review", "dm_all", "group_all"].includes(type);
  if (needsTyping && stringField(input.confirm, 20) !== "DELETE") return fail("confirm_required", 422);
  const result = await runHardDelete(viewer, {
    type,
    targetId,
    alsoTasks: input.alsoTasks === true,
    containerId: stringField(input.containerId, 80) || undefined,
  });
  if (!result.ok) return fail(result.error, result.status);
  if (input.retryJobId) {
    await db.update(hardDeleteJobs).set({ status: "DONE" }).where(inArray(hardDeleteJobs.id, [String(input.retryJobId)]));
  }
  return Response.json(result);
}
