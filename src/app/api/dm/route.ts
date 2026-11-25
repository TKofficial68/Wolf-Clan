import { getSessionUser } from "@/lib/auth";
import { body, fail, stringField } from "@/lib/http";
import { ensureDirectConversation } from "@/lib/dm";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("unauthorized", 401);
  const input = await body<{ userId?: string }>(request);
  const targetId = stringField(input.userId, 60);
  const result = await ensureDirectConversation(user.id, targetId);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "invalid_target" ? 422 : 403;
    return fail(result.reason, status);
  }
  return Response.json({ conversationId: result.conversationId, created: result.created });
}
