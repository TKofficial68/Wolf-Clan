import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ensureDirectConversation } from "@/lib/dm";
import { EmptyState } from "@/components/ui";
import { getT } from "@/i18n/server";
import { UserX } from "lucide-react";

export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const viewer = await requireUser();
  const { user } = await searchParams;
  const { t } = await getT();
  const result = await ensureDirectConversation(viewer.id, user ?? "");
  if (result.ok) redirect(`/chat/${result.conversationId}`);
  return (
    <div className="screen flex flex-col gap-3 pt-6">
      <EmptyState
        icon={<UserX size={22} />}
        title={t("home.chatFailed")}
        body={result.reason === "blocked_by_me" || result.reason === "blocked_by_target" ? t("profile.blockedNotice") : t("common.error")}
      />
    </div>
  );
}
