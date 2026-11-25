"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "./providers";

type Status = "online" | "lost" | "reconnecting" | "syncing" | "synced";

export function ConnectionBar({ pendingCount }: { pendingCount: number }) {
  const { t } = useApp();
  const [status, setStatus] = useState<Status>("online");
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const set = (next: Status, persistMs: number) => {
      if (cancelled) return;
      setStatus(next);
      setVisible(true);
      if (timer.current) clearTimeout(timer.current);
      if (next === "online" || next === "synced") {
        timer.current = setTimeout(() => setVisible(false), persistMs);
      }
    };

    const ping = async () => {
      if (!navigator.onLine) {
        set("lost", 0);
        return;
      }
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) throw new Error("bad");
        set("online", 1500);
      } catch {
        set("reconnecting", 0);
      }
    };

    const onOnline = () => {
      set("reconnecting", 0);
      void ping();
    };
    const onOffline = () => set("lost", 0);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!navigator.onLine) set("lost", 0);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void ping();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (pendingCount > 0) {
      setStatus("syncing");
      setVisible(true);
    } else if (status === "syncing") {
      setStatus("synced");
      setVisible(true);
      const timeout = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [pendingCount, status]);

  if (!visible) return null;

  const label =
    status === "lost"
      ? t("chat.connectionLost")
      : status === "reconnecting"
        ? t("chat.reconnecting")
        : status === "syncing"
          ? t("chat.syncing", { count: pendingCount })
          : status === "synced"
            ? t("chat.synced")
            : t("chat.connected");

  const color = status === "lost" ? "var(--danger)" : status === "reconnecting" ? "var(--warning)" : status === "syncing" ? "var(--blue)" : "var(--success)";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
    >
      <div
        className="mt-0.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
        style={{ background: "rgba(7,11,18,0.88)", color, border: `1px solid ${color}` }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </div>
    </div>
  );
}
