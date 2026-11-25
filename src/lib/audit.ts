import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(input: {
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      detail: input.detail ? input.detail.slice(0, 500) : null,
    });
  } catch (error) {
    console.warn("[audit] write failed", error instanceof Error ? error.message : error);
  }
}
