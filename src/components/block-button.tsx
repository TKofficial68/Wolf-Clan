"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserX } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { Spinner } from "./ui";

export function BlockButton({ userId, blocked }: { userId: string; blocked: boolean }) {
  const { t, toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isBlocked, setIsBlocked] = useState(blocked);

  const toggle = async () => {
    setBusy(true);
    const result = isBlocked
      ? await api(`/api/blocks?userId=${userId}`, { method: "DELETE" })
      : await api("/api/blocks", { method: "POST", body: { userId } });
    setBusy(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    setIsBlocked(!isBlocked);
    toast(isBlocked ? t("profile.unblockedToast") : t("profile.blockedToast"), "success");
    router.refresh();
  };

  return (
    <button type="button" className="btn btn-ghost w-full" onClick={() => void toggle()} disabled={busy}>
      {busy ? <Spinner /> : isBlocked ? <UserCheck size={15} /> : <UserX size={15} />}
      {isBlocked ? t("profile.unblock") : t("profile.block")}
    </button>
  );
}
