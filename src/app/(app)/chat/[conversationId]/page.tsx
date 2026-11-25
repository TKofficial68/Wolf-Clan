import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { directConversationMembers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ChatScreen } from "@/components/chat-screen";

export default async function ChatPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const viewer = await requireUser();
  const { conversationId } = await params;
  const membership = await db
    .select({ conversationId: directConversationMembers.conversationId })
    .from(directConversationMembers)
    .where(and(eq(directConversationMembers.conversationId, conversationId), eq(directConversationMembers.userId, viewer.id)))
    .limit(1);
  if (!membership.length) notFound();
  return <ChatScreen kind="dm" id={conversationId} />;
}
