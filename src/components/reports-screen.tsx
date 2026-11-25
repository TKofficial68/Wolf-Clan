"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flag, Send } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { EmptyState, ErrorState, ListSkeleton, ScreenHeader, Sheet, Spinner } from "./ui";
import { formatDateTime } from "@/lib/time";

type ReportItem = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  detail: string | null;
  status: string;
  moderatorNote: string | null;
  createdAt: string;
  reporter: { id: string; displayName: string; role: string; avatarUrl: string | null };
};

const REASONS = [
  ["SPAM", "reports.reasonSpam"],
  ["HARASSMENT", "reports.reasonHarassment"],
  ["INAPPROPRIATE", "reports.reasonInappropriate"],
  ["OTHER", "reports.reasonOther"],
] as const;

export function ReportsScreen() {
  const { t, toast, locale } = useApp();
  const [scope, setScope] = useState<"mine" | "queue">("mine");
  const [items, setItems] = useState<ReportItem[] | null>(null);
  const [canModerate, setCanModerate] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ items: ReportItem[]; canModerate: boolean }>(`/api/reports?scope=${scope}`);
    if (result.ok) {
      setItems(result.data.items);
      setCanModerate(result.data.canModerate);
      setError(false);
    } else setError(true);
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <ScreenHeader
        title={t("reports.title")}
        art="/brand/header.webp"
        back={<Link href="/menu" className="icon-btn h-9 w-9" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>}
      />
      <div className="screen flex flex-col gap-2" style={{ paddingTop: 10 }}>
        <div className="flex gap-1.5">
          <button type="button" className={`pill flex-1 text-[12px] ${scope === "mine" ? "pill-active" : ""}`} onClick={() => setScope("mine")}>{t("reports.mine")}</button>
          {canModerate ? <button type="button" className={`pill flex-1 text-[12px] ${scope === "queue" ? "pill-active" : ""}`} onClick={() => setScope("queue")}>{t("reports.queue")}</button> : null}
        </div>
        {error ? <ErrorState message={t("reports.loadFailed")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {!items && !error ? <ListSkeleton rows={3} /> : null}
        {items && items.length === 0 ? (
          <EmptyState icon={<Flag size={22} />} title={scope === "mine" ? t("reports.emptyMine") : t("reports.emptyQueue")} body={t("reports.detail")} />
        ) : null}
        {items?.map((report) => (
          <div key={report.id} className="g-card p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] font-semibold">{report.targetType} · {report.reason}</p>
              <span className="pill min-h-[22px] px-1.5 text-[9px]">{report.status}</span>
            </div>
            {report.detail ? <p className="muted mt-1 text-[11.5px]">{report.detail}</p> : null}
            <p className="muted tiny mt-1">{report.reporter.displayName} · {formatDateTime(report.createdAt, locale)}</p>
            {report.moderatorNote ? <p className="mt-1 rounded-[8px] bg-[var(--surface)] p-1.5 text-[11px]">{t("reports.note")}: {report.moderatorNote}</p> : null}
            {scope === "queue" ? (
              <div className="mt-1.5 flex gap-1">
                {(["REVIEWING", "RESOLVED", "REJECTED"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className="pill min-h-[26px] px-2 text-[10px]"
                    onClick={async () => {
                      const result = await api("/api/reports", { method: "POST", body: { action: "status", reportId: report.id, status, note: "" } });
                      if (!result.ok) {
                        toast(t("common.error"), "error");
                        return;
                      }
                      toast(t("reports.saved"), "success");
                      await load();
                    }}
                  >
                    {status.toLowerCase()}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  targetType: "message" | "review" | "comment" | "user" | "group";
  targetId: string;
  snapshot?: string;
}) {
  const { t, toast } = useApp();
  const [reason, setReason] = useState("SPAM");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title={t("reports.new")}>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map(([value, key]) => (
            <button key={value} type="button" className={`pill text-[11px] ${reason === value ? "pill-active" : ""}`} onClick={() => setReason(value)}>{t(key)}</button>
          ))}
        </div>
        <textarea className="field" rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder={t("reports.detail")} maxLength={600} />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await api("/api/reports", { method: "POST", body: { action: "create", targetType, targetId, reason, detail, snapshot } });
            setBusy(false);
            if (!result.ok) {
              toast(t("common.error"), "error");
              return;
            }
            toast(t("reports.sent"), "success");
            setDetail("");
            onClose();
          }}
        >
          {busy ? <Spinner /> : <Send size={14} />} {t("reports.submit")}
        </button>
      </div>
    </Sheet>
  );
}
