import { getSessionUser } from "@/lib/auth";
import { body, fail, isUuid, stringField } from "@/lib/http";
import {
  ChatError,
  actOnMessage,
  clearDmForMe,
  getChatPayload,
  markThreadRead,
  sendMessage,
  setTyping,
} from "@/lib/chat-server";
import type { ChatScopeKind } from "@/lib/chat-types";

export const dynamic = "force-dynamic";

function scopeOf(value: unknown): ChatScopeKind {
  return value === "group" ? "group" : "dm";
}

export async function GET(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const url = new URL(request.url);
  const kind = scopeOf(url.searchParams.get("kind"));
  const id = url.searchParams.get("id") ?? "";
  if (!id) return fail("scope_required", 422);
  if (!isUuid(id)) return fail("invalid_id", 422);
  try {
    const payload = await getChatPayload(viewer, kind, id, {
      before: url.searchParams.get("before") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    });
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChatError) return fail(error.message, error.status);
    console.error("[chat] load failed", error);
    return fail("chat_load_failed", 500);
  }
}

export async function POST(request: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return fail("unauthorized", 401);
  const input = await body<Record<string, unknown>>(request);
  const action = stringField(input.action, 30);
  const kind = scopeOf(input.kind);
  const id = stringField(input.scopeId ?? input.id, 80);
  if (!isUuid(id)) return fail("invalid_id", 422);
  try {
    if (action === "send") {
      const result = await sendMessage(viewer, {
        kind,
        id,
        body: typeof input.body === "string" ? input.body : "",
        messageType: stringField(input.messageType, 20),
        mediaId: stringField(input.mediaId, 60) || null,
        clientMessageId: stringField(input.clientMessageId, 80),
        replyToId: stringField(input.replyToId, 60) || null,
      });
      return Response.json({ ok: true, ...result });
    }
    if (action === "read") {
      await markThreadRead(viewer, kind, id, stringField(input.messageId, 60) || undefined);
      return Response.json({ ok: true });
    }
    if (action === "typing") {
      await setTyping(viewer, kind, id);
      return Response.json({ ok: true });
    }
    if (action === "clear") {
      if (kind !== "dm") return fail("unsupported", 422);
      await clearDmForMe(viewer, id);
      return Response.json({ ok: true });
    }
    if (["edit", "delete", "react", "pin"].includes(action)) {
      const result = await actOnMessage(viewer, action, input);
      return Response.json(result);
    }
    return fail("unknown_action", 400);
  } catch (error) {
    if (error instanceof ChatError) return fail(error.message, error.status);
    console.error("[chat] action failed", error);
    return fail("chat_action_failed", 500);
  }
}
