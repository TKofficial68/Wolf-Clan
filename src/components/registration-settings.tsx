"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, UserCheck, UserX } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { Spinner } from "./ui";

type Approval = { userId: string; status: string; requestedAt: string; name: string; username: string };

export function RegistrationSettings() {
  const { t, toast } = useApp();
  const [mode, setMode] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ registrationMode: string; approvals: Approval[] }>("/api/owner?section=invites");
    if (result.ok) {
      setMode(result.data.registrationMode);
      setApprovals(result.data.approvals);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMode = async (next: string) => {
    setBusy(true);
    const result = await api("/api/owner", { method: "POST", body: { action: "registration-mode", mode: next } });
    setBusy(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    setMode(next);
    toast(t("owner.modeSaved"), "success");
  };

  const decide = async (userId: string, approve: boolean) => {
    const result = await api("/api/owner", { method: "POST", body: { action: "approve-member", userId, approve } });
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    toast(approve ? t("owner.approve") : t("owner.reject"), "success");
    await load();
  };

  return (
    <div className="g-card flex flex-col gap-2 p-3">
      <p className="text-[12.5px] font-semibold">{t("owner.registrationMode")}</p>
      <div className="flex flex-wrap gap-1.5">
        {[
          ["open", t("owner.registrationOpen")],
          ["invite_only", t("owner.registrationInvite")],
          ["open_approval", t("owner.registrationApproval")],
        ].map(([value, label]) => (
          <button key={value} type="button" disabled={busy} className={`pill min-h-[28px] px-2.5 text-[10.5px] ${mode === value ? "pill-active" : ""}`} onClick={() => void saveMode(value)}>
            {busy && mode !== value ? null : mode === value ? <Check size={11} /> : null} {label}
          </button>
        ))}
      </div>
      <p className="muted tiny">{t("owner.registrationHint")}</p>

      <p className="mt-1 text-[12.5px] font-semibold">{t("owner.pendingSignups")}</p>
      {approvals.filter((entry) => entry.status === "PENDING").length === 0 ? <p className="muted tiny">{t("owner.noResults")}</p> : null}
      {approvals
        .filter((entry) => entry.status === "PENDING")
        .map((entry) => (
          <div key={entry.userId} className="flex items-center gap-2 border-b border-[var(--border)] py-1.5 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold">{entry.name}</span>
              <span className="muted tiny block">@{entry.username}</span>
            </span>
            <button type="button" className="pill min-h-[26px] px-2 text-[10px]" onClick={() => void decide(entry.userId, true)}>
              <UserCheck size={11} /> {t("owner.approveSignup")}
            </button>
            <button type="button" className="pill min-h-[26px] px-2 text-[10px]" style={{ color: "var(--danger)" }} onClick={() => void decide(entry.userId, false)}>
              <UserX size={11} /> {t("owner.rejectSignup")}
            </button>
          </div>
        ))}
      {busy ? <Spinner size={14} /> : null}
    </div>
  );
}
