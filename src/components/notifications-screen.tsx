"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { EmptyState, ErrorState, ListSkeleton, ScreenHeader, Spinner } from "./ui";
import type { NotificationItem } from "@/app/api/notifications/route";
import type { MessageKey } from "@/i18n";

const KIND_LABEL: Record<string, MessageKey> = {
  dm: "notifications.kindDm",
  group: "notifications.kindGroup",
  mention: "notifications.kindMention",
  reply: "notifications.kindReply",
  reaction: "notifications.kindReaction",
  review: "notifications.kindReview",
  moderation: "notifications.kindModeration",
  announcement: "notifications.kindAnnouncement",
};

export function NotificationsScreen() {
  const { t, toast } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pushState, setPushState] = useState<string>("default");

  const load = useCallback(async () => {
    const result = await api<{ items: NotificationItem[] }>("/api/notifications");
    if (result.ok) {
      setItems(result.data.items);
      setError(false);
    } else {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    if (typeof Notification !== "undefined") setPushState(Notification.permission);
  }, [load]);

  const grouped = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, NotificationItem[]>();
    for (const item of items) {
      const day = new Date(item.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
      map.set(day, [...(map.get(day) ?? []), item]);
    }
    return Array.from(map.entries());
  }, [items]);

  const unread = items?.filter((item) => !item.read).length ?? 0;

  return (
    <>
      <ScreenHeader
        title={t("notifications.title")}
        art="/brand/header.webp"
        right={
          <button
            type="button"
            className="icon-btn"
            aria-label={t("notifications.markAll")}
            disabled={busy || unread === 0}
            onClick={async () => {
              setBusy(true);
              const result = await api("/api/notifications", { method: "POST", body: { action: "read-all" } });
              setBusy(false);
              if (!result.ok) {
                toast(t("common.error"), "error");
                return;
              }
              toast(t("notifications.markedAll"), "success");
              await load();
            }}
          >
            {busy ? <Spinner /> : <CheckCheck size={18} />}
          </button>
        }
      />
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
        {unread > 0 ? <p className="muted px-0.5 text-[11.5px]">{t("notifications.unreadCount", { count: unread })}</p> : null}
        {pushState !== "granted" ? (
          <a href="/settings#notifications" className="g-card-flat flex items-start gap-2 p-2.5">
            <SlidersHorizontal size={15} className="mt-0.5 flex-none text-[var(--electric)]" />
            <span>
              <span className="block text-[12.5px] font-semibold">{t("notifications.pushOff")}</span>
              <span className="muted tiny block">{t("notifications.pushOffBody")}</span>
            </span>
          </a>
        ) : null}

        {error && !items ? <ErrorState message={t("notifications.loadFailed")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {!items && !error ? <ListSkeleton rows={4} /> : null}
        {items && items.length === 0 ? <EmptyState icon={<Bell size={22} />} title={t("notifications.empty")} body={t("notifications.emptyBody")} /> : null}

        {grouped.map(([day, entries]) => (
          <section key={day} className="flex flex-col gap-1.5">
            <p className="section-label">
              {day === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" }) ? t("notifications.today") : new Date(day).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </p>
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={async () => {
                  await api("/api/notifications", { method: "POST", body: { action: "read", id: entry.id } });
                  if (entry.href) router.push(entry.href);
                  else await load();
                }}
                className="g-card-flat flex items-start gap-2 p-2.5 text-left"
                style={entry.read ? undefined : { borderColor: "var(--electric)" }}
              >
                <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[var(--border)] text-[var(--electric)]">
                  <Bell size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold">{entry.title}</span>
                    {!entry.read ? <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--pink)" }} /> : null}
                  </span>
                  {entry.body ? <span className="muted mt-0.5 line-clamp-2 block text-[11.5px]">{entry.body}</span> : null}
                  <span className="muted tiny mt-0.5 block">
                    {t(KIND_LABEL[entry.kind] ?? "notifications.title")} ·{" "}
                    {new Date(entry.createdAt).toLocaleTimeString(undefined, { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit", hour12: true })}
                  </span>
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
