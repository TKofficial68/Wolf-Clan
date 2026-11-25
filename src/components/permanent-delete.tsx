"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { Sheet, Spinner } from "./ui";
import { formatBytes } from "@/lib/media-types";
import type { MessageKey } from "@/i18n";

export type HardDeleteType =
  | "message"
  | "media"
  | "dm_all"
  | "group_all"
  | "group"
  | "review"
  | "task"
  | "project"
  | "announcement"
  | "task_comment"
  | "review_comment"
  | "meeting";

export function PermanentDeleteDialog({
  open,
  onClose,
  onDeleted,
  type,
  targetId,
  label,
  typing = false,
  alsoTasksOption = false,
  containerId,
  style = "button",
}: {
  open: boolean;
  onClose: () => void;
  onDeleted: (result: { messages: number; files: number; bytes: number }) => void;
  type: HardDeleteType;
  targetId: string;
  label: string;
  typing?: boolean;
  alsoTasksOption?: boolean;
  containerId?: string;
  style?: "button" | "row";
}) {
  const { t, toast } = useApp();
  const [counts, setCounts] = useState<{ messages: number; files: number; bytes: number } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [alsoTasks, setAlsoTasks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirm("");
    setError(null);
    setProgress(0);
    void api<{ counts: { messages: number; files: number; bytes: number } | null }>(
      `/api/hard-delete?countType=${type}&targetId=${encodeURIComponent(targetId)}`,
    ).then((result) => {
      if (result.ok) setCounts(result.data.counts ?? { messages: 0, files: 0, bytes: 0 });
    });
  }, [open, type, targetId]);

  const run = async () => {
    setBusy(true);
    setProgress(25);
    const result = await api<{ messages: number; files: number; bytes: number }>("/api/hard-delete", {
      method: "POST",
      body: { type, targetId, confirm, alsoTasks, containerId },
    });
    setProgress(95);
    setBusy(false);
    if (!result.ok) {
      setError(t(`delete.error.${result.data.error}` as MessageKey, {}) === `delete.error.${result.data.error}` ? t("delete.failed") : t(`delete.error.${result.data.error}` as MessageKey));
      toast(t("delete.failed"), "error");
      return;
    }
    setProgress(100);
    toast(t("delete.done"), "success");
    onDeleted({ messages: result.data.messages, files: result.data.files, bytes: result.data.bytes });
    onClose();
  };

  return (
    <Sheet open={open} onClose={busy ? () => undefined : onClose} title={t("delete.title")}>
      <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>{label}</p>
      <p className="muted mt-1 text-[12px]">{t("delete.warning")}</p>
      <div className="mt-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[12px]">
        <p>{t("delete.summary", { messages: counts?.messages ?? 0, files: counts?.files ?? 0, size: formatBytes(counts?.bytes ?? 0) })}</p>
      </div>
      {alsoTasksOption ? (
        <label className="mt-2 flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={alsoTasks} onChange={(event) => setAlsoTasks(event.target.checked)} className="h-4 w-4 accent-[var(--danger)]" />
          {t("delete.alsoTasks")}
        </label>
      ) : null}
      {typing ? (
        <label className="mt-3 block">
          <span className="label">{t("delete.typeWord")}</span>
          <input className="field" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="DELETE" />
        </label>
      ) : null}
      {busy || progress > 0 ? (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "linear-gradient(90deg,#EF4444,#D946EF)", transition: "width .2s linear" }} />
          </div>
          <p className="muted tiny mt-1">{busy ? t("delete.running", { percent: progress }) : t("delete.done")}</p>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
        <button
          type="button"
          className="btn btn-danger flex-1"
          disabled={busy || (typing && confirm !== "DELETE")}
          onClick={() => void run()}
        >
          {busy ? <Spinner /> : <Trash2 size={14} />} {t("delete.confirm")}
        </button>
      </div>
    </Sheet>
  );
}

export function DeleteMenuItem({
  type,
  targetId,
  label,
  typing,
  alsoTasksOption,
  containerId,
  onDeleted,
  className = "btn btn-danger justify-start",
}: {
  type: HardDeleteType;
  targetId: string;
  label: string;
  typing?: boolean;
  alsoTasksOption?: boolean;
  containerId?: string;
  onDeleted: (result: { messages: number; files: number; bytes: number }) => void;
  className?: string;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Trash2 size={14} /> {t("delete.menu")}
      </button>
      <PermanentDeleteDialog
        open={open}
        onClose={() => setOpen(false)}
        onDeleted={onDeleted}
        type={type}
        targetId={targetId}
        label={label}
        typing={typing}
        alsoTasksOption={alsoTasksOption}
        containerId={containerId}
      />
    </>
  );
}
