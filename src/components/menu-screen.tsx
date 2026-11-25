"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  BookOpen,
  CalendarClock,
  Flag,
  Info,
  LogOut,
  Mail,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserX,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { ConfirmDialog, RowLink, Spinner } from "./ui";
import type { MessageKey } from "@/i18n";

export function MenuScreen({ role }: { role: string }) {
  const { t } = useApp();
  const router = useRouter();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const rows: { icon: React.ReactNode; label: MessageKey; href: string }[] = [
    { icon: <MessageSquare size={16} />, label: "menu.chat", href: "/home" },
    { icon: <Sparkles size={16} />, label: "menu.projects", href: "/projects" },
    { icon: <CalendarClock size={16} />, label: "menu.meetings", href: "/meetings" },
    { icon: <Bell size={16} />, label: "menu.notifications", href: "/notifications" },
    { icon: <SlidersHorizontal size={16} />, label: "menu.settings", href: "/settings" },
    { icon: <ShieldCheck size={16} />, label: "menu.privacy", href: "/settings#privacy" },
    { icon: <UserX size={16} />, label: "menu.blocked", href: "/settings#blocked" },
    { icon: <Flag size={16} />, label: "menu.reports", href: "/reports" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[rgba(3,6,12,0.6)]">
      <div className="app-body w-full max-w-[var(--shell)] self-end overflow-hidden rounded-t-[24px] border border-b-0 border-[var(--border)] bg-[var(--card)]" style={{ animation: "sheet-in .22s ease-out both" }}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="section-label">{t("menu.title")}</span>
          <button type="button" className="icon-btn h-9 w-9" aria-label={t("common.close")} onClick={() => router.back()}>
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[80dvh] overflow-y-auto px-3 pb-[calc(18px+env(safe-area-inset-bottom))]">
          {rows.map((row) => (
            <RowLink key={row.href} icon={row.icon} label={t(row.label)} href={row.href} />
          ))}
          {role === "OWNER" ? (
            <RowLink icon={<ShieldCheck size={16} />} label={t("menu.ownerControls")} href="/scaffold/owner-controls" />
          ) : null}
          <RowLink icon={<BookOpen size={16} />} label={t("menu.howToUse")} href="/how-to-use" />
          <RowLink icon={<Info size={16} />} label={t("menu.about")} href="/about" />
          <RowLink icon={<Mail size={16} />} label={t("menu.contactDev")} href="/contact/developer" />
          <RowLink icon={<Users size={16} />} label={t("menu.contactOwner")} href="/contact/owner" />
          <button
            type="button"
            className="flex min-h-[52px] w-full items-center gap-3 px-1 py-2.5"
            style={{ color: "var(--danger)" }}
            onClick={() => setConfirmLogout(true)}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.08)]">
              <LogOut size={16} />
            </span>
            <span className="flex-1 text-left text-[14px] font-medium">{t("menu.logout")}</span>
            {busy ? <Spinner /> : null}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmLogout}
        title={t("menu.logoutTitle")}
        body={t("menu.logoutBody")}
        confirmLabel={t("menu.logout")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void logout()}
        onClose={() => setConfirmLogout(false)}
        busy={busy}
      />
    </div>
  );
}
