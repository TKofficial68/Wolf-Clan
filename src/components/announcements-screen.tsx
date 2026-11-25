"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Megaphone, Pencil, Pin, PinOff, Plus, Trash2, X } from "lucide-react";
import type { AnnouncementItem } from "@/app/api/announcements/route";
import { formatDateTime } from "@/lib/time";
import { api, errorKey } from "@/lib/client";
import { useViewer } from "./media-viewer-provider";
import { useApp } from "./providers";
import { Avatar, ConfirmDialog, EmptyState, ErrorState, ListSkeleton, NameWithTag, ScreenHeader, Sheet, Spinner } from "./ui";
import type { MessageKey } from "@/i18n";

type Draft = { id?: string; title: string; body: string; pinned: boolean; imageUploadId: string | null; imageUrl: string | null };

const emptyDraft: Draft = { title: "", body: "", pinned: false, imageUploadId: null, imageUrl: null };

export function AnnouncementsScreen() {
  const { t, locale, toast } = useApp();
  const { open: openViewer } = useViewer();
  const [items, setItems] = useState<AnnouncementItem[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementItem | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ items: AnnouncementItem[]; canManage: boolean }>("/api/announcements");
    if (result.ok) {
      setItems(result.data.items);
      setCanManage(result.data.canManage);
      setError(false);
      if (result.data.items.some((item) => !item.isRead)) {
        await api("/api/announcements/read", { method: "POST" });
        setItems(result.data.items.map((item) => ({ ...item, isRead: true })));
      }
    } else {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDraft = async () => {
    if (!draft) return;
    if (draft.title.trim().length < 3) {
      toast(t("ann.titleRequired"), "error");
      return;
    }
    if (draft.body.trim().length < 3) {
      toast(t("ann.bodyRequired"), "error");
      return;
    }
    setBusy(true);
    const payload = {
      id: draft.id,
      title: draft.title.trim(),
      body: draft.body.trim(),
      pinned: draft.pinned,
      imageUploadId: draft.imageUploadId ?? "",
    };
    const result = draft.id
      ? await api("/api/announcements", { method: "PATCH", body: payload })
      : await api("/api/announcements", { method: "POST", body: payload });
    setBusy(false);
    if (!result.ok) {
      toast(t(errorKey(result.data.error, "common.error") as MessageKey), "error");
      return;
    }
    setDraft(null);
    toast(draft.id ? t("ann.updated") : t("ann.created"), "success");
    await load();
  };

  const togglePin = async (item: AnnouncementItem) => {
    const result = await api("/api/announcements", { method: "PATCH", body: { id: item.id, pinned: !item.pinned } });
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    toast(item.pinned ? t("ann.unpinnedToast") : t("ann.pinnedToast"), "success");
    await load();
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const result = await api(`/api/announcements?id=${deleteTarget.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleteTarget(null);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    toast(t("ann.deleted"), "success");
    await load();
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const result = await api<{ id: string; url: string }>("/api/uploads", { method: "POST", formData: form });
    setUploading(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    setDraft((prev) => (prev ? { ...prev, imageUploadId: result.data.id, imageUrl: result.data.url } : prev));
  };

  return (
    <>
      <ScreenHeader
        title={t("ann.title")}
        art="/brand/header-reviews.webp"
        back={
          <Link href="/home" className="icon-btn h-9 w-9" aria-label={t("common.back")}>
            <ArrowLeft size={16} />
          </Link>
        }
        right={
          canManage ? (
            <button type="button" className="icon-btn" aria-label={t("ann.new")} onClick={() => setDraft({ ...emptyDraft })}>
              <Plus size={18} />
            </button>
          ) : undefined
        }
      />
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
        <p className="muted px-0.5 text-[12px]">{t("ann.subtitle")}</p>

        {error && !items ? <ErrorState message={t("common.networkError")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {!items && !error ? <ListSkeleton rows={3} /> : null}

        {items && items.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={22} />}
            title={t("ann.emptyTitle")}
            body={t("ann.emptyBody")}
            action={
              canManage ? (
                <button type="button" className="btn btn-primary" onClick={() => setDraft({ ...emptyDraft })}>
                  <Plus size={16} /> {t("ann.new")}
                </button>
              ) : undefined
            }
          />
        ) : null}

        {items?.map((item) => (
          <article key={item.id} className="g-card p-3">
            <div className="flex items-start gap-2.5">
              <span
                className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
                style={{ background: "linear-gradient(150deg,#2a1745,#121b29)", border: "1px solid var(--purple)" }}
              >
                <Megaphone size={16} style={{ color: "#EBDCFF" }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-[15px] font-semibold leading-snug">{item.title}</h2>
                  {item.pinned ? (
                    <span className="flex flex-none items-center gap-1 text-[10px]" style={{ color: "var(--gold)" }}>
                      <Pin size={11} /> {t("ann.pinned")}
                    </span>
                  ) : null}
                </div>
                <p className="muted tiny mt-0.5">{formatDateTime(item.createdAt, locale)}</p>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed">{item.body}</p>
            {item.imageUrl ? (
              <button
                type="button"
                className="mt-2 block w-full"
                onClick={() =>
                  openViewer({
                    title: item.title,
                    items: [
                      {
                        id: (item.imageUrl ?? "").split("/").pop() ?? "",
                        thumbId: null,
                        kind: "image",
                        name: `${item.title}.jpg`,
                        mime: "image/jpeg",
                        size: 0,
                        width: 420,
                        height: 220,
                        duration: null,
                        expired: false,
                        createdAt: item.createdAt,
                        senderName: item.author.displayName,
                      },
                    ],
                    index: 0,
                  })
                }
                aria-label={t("viewer.open")}
              >
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  width={420}
                  height={220}
                  loading="lazy"
                  className="max-h-[220px] w-full rounded-[12px] border border-[var(--border)] object-cover"
                />
              </button>
            ) : null}
            <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--border)] pt-2">
              <Avatar name={item.author.displayName} src={item.author.avatarUrl} size={26} />
              <span className="min-w-0 flex-1 truncate text-[12px]">
                <NameWithTag name={item.author.displayName} role={item.author.role} title={item.author.title} size={11} />
              </span>
              <span className="muted tiny">{t("ann.readBy", { count: item.readCount })}</span>
            </div>
            {canManage ? (
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn btn-soft min-h-[34px] flex-1 px-2 text-[12px]"
                  onClick={() => setDraft({
                    id: item.id,
                    title: item.title,
                    body: item.body,
                    pinned: item.pinned,
                    imageUploadId: null,
                    imageUrl: item.imageUrl,
                  })}
                >
                  <Pencil size={13} /> {t("common.edit")}
                </button>
                <button type="button" className="btn btn-ghost min-h-[34px] flex-1 px-2 text-[12px]" onClick={() => void togglePin(item)}>
                  {item.pinned ? <PinOff size={13} /> : <Pin size={13} />} {item.pinned ? t("ann.unpin") : t("ann.pin")}
                </button>
                <button
                  type="button"
                  className="btn btn-danger min-h-[34px] px-2.5"
                  aria-label={t("ann.delete")}
                  onClick={() => setDeleteTarget(item)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <Sheet open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? t("ann.edit") : t("ann.new")}>
        {draft ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="label" htmlFor="ann-title">
                {t("ann.fieldTitle")}
              </label>
              <input
                id="ann-title"
                className="field"
                maxLength={80}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="ann-body">
                {t("ann.fieldBody")}
              </label>
              <textarea
                id="ann-body"
                className="field"
                maxLength={2000}
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              />
            </div>
            <div>
              <span className="label">{t("ann.fieldImage")}</span>
              {draft.imageUrl ? (
                <div className="relative mb-2">
                  <img src={draft.imageUrl} alt="" width={400} height={180} className="max-h-[160px] w-full rounded-[12px] object-cover" />
                  <button
                    type="button"
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(7,11,18,0.75)] text-white"
                    aria-label={t("ann.removeImage")}
                    onClick={() => setDraft({ ...draft, imageUrl: null, imageUploadId: null })}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}
              <label className="btn btn-ghost w-full cursor-pointer">
                {uploading ? <Spinner /> : <Plus size={15} />} {t("ann.addImage")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadImage(file);
                  }}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={draft.pinned}
                onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })}
                className="h-4 w-4 accent-[var(--blue)]"
              />
              {t("ann.pin")}
            </label>
            <button type="button" className="btn btn-primary" onClick={() => void saveDraft()} disabled={busy || uploading}>
              {busy ? <Spinner /> : null} {draft.id ? t("common.save") : t("ann.create")}
            </button>
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("ann.deleteTitle")}
        body={t("ann.deleteBody")}
        confirmLabel={t("ann.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void remove()}
        onClose={() => setDeleteTarget(null)}
        busy={busy}
      />
    </>
  );
}
