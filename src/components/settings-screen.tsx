"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Download, Lock, Smartphone, Trash2 } from "lucide-react";
import { api, errorKey } from "@/lib/client";
import { formatDateTime } from "@/lib/time";
import { useApp } from "./providers";
import { Avatar, ConfirmDialog, ScreenHeader, SectionCard, Spinner, Toggle } from "./ui";
import type { MessageKey } from "@/i18n";
import type { Locale } from "@/i18n";
import type { AnimationLevel, Theme } from "./providers";

type SettingsValues = {
  pushEnabled: boolean;
  notifyMessages: boolean;
  notifyGroups: boolean;
  notifyMentions: boolean;
  notifyReplies: boolean;
  notifyReactions: boolean;
  notifyTasks: boolean;
  notifyDeadlines: boolean;
  notifyMeetings: boolean;
  notifyAnnouncements: boolean;
  notifyReviews: boolean;
  sound: boolean;
  vibration: boolean;
  messagePreview: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  theme: string;
  language: string;
  animationLevel: string;
  reduceMotion: boolean;
};

type PrivacyValues = {
  onlineVisibility: string;
  lastSeenVisibility: string;
  profileVisibility: string;
};

type SessionRow = { id: string; userAgent: string | null; createdAt: string; lastUsedAt: string; current: boolean };
type BlockRow = { id: string; displayName: string; username: string; role: string; avatarUrl: string | null };

const notificationToggles: { key: keyof SettingsValues; label: MessageKey }[] = [
  { key: "notifyMessages", label: "settings.msgMessages" },
  { key: "notifyGroups", label: "settings.msgGroups" },
  { key: "notifyMentions", label: "settings.msgMentions" },
  { key: "notifyReplies", label: "settings.msgReplies" },
  { key: "notifyReactions", label: "settings.msgReactions" },
  { key: "notifyTasks", label: "settings.msgTasks" },
  { key: "notifyDeadlines", label: "settings.msgDeadlines" },
  { key: "notifyMeetings", label: "settings.msgMeetings" },
  { key: "notifyAnnouncements", label: "settings.msgAnnouncements" },
  { key: "notifyReviews", label: "settings.msgReviews" },
];

export function SettingsScreen({
  user,
  settings: initialSettings,
  privacy: initialPrivacy,
  focus,
}: {
  user: { email: string; username: string; displayName: string; avatarUrl: string | null; role: string };
  settings: SettingsValues;
  privacy: PrivacyValues;
  focus?: string;
}) {
  const { t, locale, prefs, setTheme, setLanguage, setReduceMotion, setAnimationLevel, toast } = useApp();
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsValues>(initialSettings);
  const [privacy, setPrivacy] = useState<PrivacyValues>(initialPrivacy);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [blocked, setBlocked] = useState<BlockRow[] | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cacheSize, setCacheSize] = useState<string>("—");
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    if (!focus) return;
    const element = document.getElementById(focus);
    if (element) element.scrollIntoView({ block: "start" });
  }, [focus]);

  useEffect(() => {
    void (async () => {
      const [account, blocks] = await Promise.all([api<{ sessions: SessionRow[] }>("/api/account"), api<{ blocked: BlockRow[] }>("/api/blocks")]);
      if (account.ok) setSessions(account.data.sessions);
      if (blocks.ok) setBlocked(blocks.data.blocked);
    })();
    if ("storage" in navigator && navigator.storage.estimate) {
      void navigator.storage.estimate().then((estimate) => {
        const mb = (estimate.usage ?? 0) / (1024 * 1024);
        setCacheSize(`${mb < 1 ? mb.toFixed(2) : mb.toFixed(1)} MB`);
      });
    }
    if (window.matchMedia("(display-mode: standalone)").matches) setStandalone(true);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as Event & { prompt: () => Promise<void> };
      setInstallPrompt({ prompt: () => promptEvent.prompt() });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setStandalone(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const saveSettings = async (patch: Partial<SettingsValues> & Partial<PrivacyValues>, revert?: () => void) => {
    setSaving(true);
    const result = await api("/api/settings", { method: "PATCH", body: patch });
    setSaving(false);
    if (!result.ok) {
      revert?.();
      toast(t("settings.saveFailed"), "error");
    }
  };

  const update = (key: keyof SettingsValues, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    void saveSettings({ [key]: value } as Partial<SettingsValues>, () => setSettings((prev) => ({ ...prev, [key]: !value })));
  };

  const updatePrivacy = (key: keyof PrivacyValues, value: string) => {
    const previous = privacy[key];
    setPrivacy((prev) => ({ ...prev, [key]: value }));
    void saveSettings({ [key]: value } as Partial<PrivacyValues>, () => setPrivacy((prev) => ({ ...prev, [key]: previous })));
  };

  const togglePush = async (next: boolean) => {
    if (!next) {
      update("pushEnabled", false);
      return;
    }
    if (typeof Notification === "undefined") {
      toast(t("settings.pushUnavailable"), "error");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast(t("settings.pushDenied"), "error");
      return;
    }
    update("pushEnabled", true);
  };

  const saveUsername = async () => {
    setBusyAction("username");
    const result = await api("/api/profile", { method: "PATCH", body: { username } });
    setBusyAction(null);
    if (!result.ok) {
      toast(t(errorKey(result.data.error, "common.error") as MessageKey), "error");
      return;
    }
    toast(t("profile.usernameSaved"), "success");
    router.refresh();
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyAction("password");
    const result = await api("/api/account", {
      method: "POST",
      body: {
        action: "change-password",
        currentPassword: passwords.current,
        newPassword: passwords.next,
        confirmPassword: passwords.confirm,
      },
    });
    setBusyAction(null);
    if (!result.ok) {
      toast(t(errorKey(result.data.error, "common.error") as MessageKey), "error");
      return;
    }
    setPasswords({ current: "", next: "", confirm: "" });
    toast(t("settings.passwordChanged"), "success");
    const account = await api<{ sessions: SessionRow[] }>("/api/account");
    if (account.ok) setSessions(account.data.sessions);
  };

  const revokeSession = async (id: string) => {
    setBusyAction(id);
    const result = await api("/api/account", { method: "POST", body: { action: "revoke", sessionId: id } });
    setBusyAction(null);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    setSessions((prev) => (prev ? prev.filter((row) => row.id !== id) : prev));
    toast(t("settings.sessionRevoked"), "success");
  };

  const revokeOthers = async () => {
    setBusyAction("others");
    const result = await api("/api/account", { method: "POST", body: { action: "revoke-others" } });
    setBusyAction(null);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    const account = await api<{ sessions: SessionRow[] }>("/api/account");
    if (account.ok) setSessions(account.data.sessions);
    toast(t("settings.sessionsRevoked"), "success");
  };

  const sendRecovery = async () => {
    setBusyAction("recovery");
    const result = await api("/api/auth/forgot", { method: "POST", body: { email: user.email } });
    setBusyAction(null);
    toast(
      result.ok ? t("auth.resetSent") : t(errorKey(result.data.error, "auth.emailNotConfigured") as MessageKey),
      result.ok ? "success" : "error",
    );
  };

  const deleteAccount = async () => {
    setDeleteBusy(true);
    const result = await api("/api/account", {
      method: "POST",
      body: { action: "delete", deleteWord, password: deletePassword },
    });
    setDeleteBusy(false);
    if (!result.ok) {
      toast(t(errorKey(result.data.error, "common.error") as MessageKey), "error");
      return;
    }
    router.push("/login");
    router.refresh();
  };

  const clearLocalData = async () => {
    let queued = false;
    try {
      queued = Object.keys(localStorage).some((key) => key.startsWith("wolf_queue") || key.startsWith("wolf_outbox"));
    } catch {
      queued = false;
    }
    if (!queued || clearOpen) {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      if (indexedDB.databases) {
        const databases = await indexedDB.databases();
        await Promise.all(
          databases.map((database) => {
            if (!database.name) return Promise.resolve();
            return new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(database.name!);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            });
          }),
        );
      }
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith("wolf_") || key.startsWith("wolf-"))
          .forEach((key) => localStorage.removeItem(key));
      } catch {
        undefined;
      }
      setClearOpen(false);
      setCacheSize("0 MB");
      toast(t("settings.clearDone"), "success");
    } else {
      setClearOpen(true);
    }
  };

  const unblock = async (id: string) => {
    const result = await api(`/api/blocks?userId=${id}`, { method: "DELETE" });
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    setBlocked((prev) => (prev ? prev.filter((row) => row.id !== id) : prev));
    toast(t("profile.unblockedToast"), "success");
  };

  return (
    <>
      <ScreenHeader
        title={t("settings.title")}
        art="/brand/header-profile.webp"
        back={
          <Link href="/profile" className="icon-btn h-9 w-9" aria-label={t("common.back")}>
            <ArrowLeft size={16} />
          </Link>
        }
        right={saving ? <Spinner /> : undefined}
      />
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
        <p className="muted flex items-center gap-2 px-0.5 text-[12px]">
          <Avatar name={user.displayName} src={user.avatarUrl} size={24} />
          {t("settings.emailLine", { email: user.email })}
        </p>

        <SectionCard title={t("settings.account")} id="account">
          <div className="flex flex-col gap-2">
            <Link href="/profile/edit" className="btn btn-ghost w-full">
              {t("profile.edit")}
            </Link>
            <div>
              <label className="label" htmlFor="settings-username">{t("settings.changeUsername")}</label>
              <div className="flex gap-2">
                <input id="settings-username" className="field" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} minLength={3} maxLength={20} />
                <button type="button" className="btn btn-soft px-3" onClick={() => void saveUsername()} disabled={busyAction === "username" || username === user.username}>
                  {busyAction === "username" ? <Spinner /> : t("common.save")}
                </button>
              </div>
            </div>
            <form className="flex flex-col gap-2 border-t border-[var(--border)] pt-2.5" onSubmit={changePassword}>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                <Lock size={14} /> {t("settings.changePassword")}
              </p>
              <input className="field" type="password" placeholder={t("settings.currentPassword")} autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))} required />
              <input className="field" type="password" placeholder={t("settings.newPassword")} autoComplete="new-password" minLength={8} value={passwords.next} onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))} required />
              <input className="field" type="password" placeholder={t("settings.confirmNewPassword")} autoComplete="new-password" minLength={8} value={passwords.confirm} onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))} required />
              <button type="submit" className="btn btn-soft" disabled={busyAction === "password"}>
                {busyAction === "password" ? <Spinner /> : t("common.save")}
              </button>
            </form>
            <div className="border-t border-[var(--border)] pt-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold">{t("settings.activeSessions")}</p>
                <button type="button" className="muted text-[11.5px]" onClick={() => void revokeOthers()} disabled={busyAction === "others"}>
                  {t("settings.revokeAll")}
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {sessions?.map((session) => (
                  <div key={session.id} className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2">
                    <Smartphone size={15} className="flex-none text-[var(--electric)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px]">{session.current ? t("settings.thisDevice") : (session.userAgent ?? t("common.unknown"))}</span>
                      <span className="muted tiny block">{t("settings.lastActive")}: {formatDateTime(session.lastUsedAt, locale)}</span>
                    </span>
                    {!session.current ? (
                      <button type="button" className="muted text-[11px]" onClick={() => void revokeSession(session.id)} disabled={busyAction === session.id}>
                        {busyAction === session.id ? <Spinner /> : t("settings.revoke")}
                      </button>
                    ) : null}
                  </div>
                ))}
                {sessions === null ? <Spinner /> : null}
              </div>
            </div>
            <div className="border-t border-[var(--border)] pt-2.5">
              <p className="mb-1 text-[13px] font-semibold">{t("settings.recovery")}</p>
              <p className="muted tiny mb-2">{t("settings.recoveryHint")}</p>
              <button type="button" className="btn btn-ghost w-full" onClick={() => void sendRecovery()} disabled={busyAction === "recovery"}>
                {busyAction === "recovery" ? <Spinner /> : t("settings.sendReset")}
              </button>
            </div>
            <button type="button" className="btn btn-danger mt-1 w-full" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={15} /> {t("settings.deleteAccount")}
            </button>
          </div>
        </SectionCard>

        <SectionCard title={t("settings.notifications")} id="notifications">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2.5">
            <div>
              <p className="text-[13px] font-semibold">{t("settings.togglePush")}</p>
              <p className="muted tiny">{t("settings.pushHint")}</p>
            </div>
            <Toggle checked={settings.pushEnabled} onChange={(next) => void togglePush(next)} label={t("settings.togglePush")} />
          </div>
          <div className="mt-1 flex flex-col">
            {notificationToggles.map((row) => (
              <label key={row.key} className="flex min-h-[42px] items-center justify-between gap-3 border-b border-[var(--border)] text-[13px] last:border-b-0">
                {t(row.label)}
                <Toggle checked={settings[row.key] as boolean} onChange={(next) => update(row.key, next)} label={t(row.label)} />
              </label>
            ))}
            <div className="mt-2 flex flex-col gap-1">
              {(["sound", "vibration", "messagePreview", "quietHoursEnabled"] as const).map((key) => (
                <label key={key} className="flex min-h-[42px] items-center justify-between gap-3 border-b border-[var(--border)] text-[13px] last:border-b-0">
                  {key === "sound" ? t("settings.sound") : key === "vibration" ? t("settings.vibration") : key === "messagePreview" ? t("settings.preview") : t("settings.quiet")}
                  <Toggle checked={settings[key]} onChange={(next) => update(key, next)} label={key} />
                </label>
              ))}
              {settings.quietHoursEnabled ? (
                <div className="flex items-center gap-2 pt-1">
                  <label className="flex flex-1 flex-col gap-1 text-[11.5px]">
                    {t("settings.quietFrom")}
                    <input
                      type="time"
                      className="field"
                      value={settings.quietStart}
                      onChange={(e) => {
                        setSettings((prev) => ({ ...prev, quietStart: e.target.value }));
                        void saveSettings({ quietStart: e.target.value });
                      }}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-[11.5px]">
                    {t("settings.quietTo")}
                    <input
                      type="time"
                      className="field"
                      value={settings.quietEnd}
                      onChange={(e) => {
                        setSettings((prev) => ({ ...prev, quietEnd: e.target.value }));
                        void saveSettings({ quietEnd: e.target.value });
                      }}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("settings.privacy")} subtitle={t("settings.privacyHint")} id="privacy">
          <div className="flex flex-col gap-2.5">
            {([
              ["onlineVisibility", "settings.privacyOnline"],
              ["lastSeenVisibility", "settings.privacyLastSeen"],
              ["profileVisibility", "settings.privacyProfile"],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-[13px]">{t(label)}</span>
                <div className="flex gap-1">
                  <button type="button" className={`pill min-h-[32px] px-2.5 text-[11.5px] ${privacy[key] === "everyone" ? "pill-active" : ""}`} onClick={() => updatePrivacy(key, "everyone")}>
                    {t("settings.everyone")}
                  </button>
                  <button type="button" className={`pill min-h-[32px] px-2.5 text-[11.5px] ${privacy[key] === "nobody" ? "pill-active" : ""}`} onClick={() => updatePrivacy(key, "nobody")}>
                    {t("settings.nobody")}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div id="blocked" className="mt-3 border-t border-[var(--border)] pt-2.5">
            <p className="mb-1 text-[13px] font-semibold">{t("settings.blockList")}</p>
            <p className="muted tiny mb-2">{t("settings.blockedNote")}</p>
            {blocked === null ? <Spinner /> : null}
            {blocked && blocked.length === 0 ? <p className="muted tiny">{t("settings.blockedEmpty")}</p> : null}
            {blocked?.map((row) => (
              <div key={row.id} className="flex items-center gap-2 border-b border-[var(--border)] py-1.5 last:border-b-0">
                <Avatar name={row.displayName} src={row.avatarUrl} size={28} />
                <span className="flex-1 truncate text-[12.5px]">{row.displayName}</span>
                <button type="button" className="pill min-h-[30px] px-2.5 text-[11.5px]" onClick={() => void unblock(row.id)}>
                  {t("settings.unblock")}
                </button>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("settings.appearance")} id="appearance">
          <div className="flex flex-col gap-2.5">
            <div>
              <p className="label">{t("settings.theme")}</p>
              <div className="flex gap-1.5">
                {(["dark", "light", "system"] as Theme[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`pill flex-1 text-[12px] ${prefs.theme === value ? "pill-active" : ""}`}
                    onClick={() => setTheme(value)}
                  >
                    {value === "dark" ? t("settings.dark") : value === "light" ? t("settings.light") : t("settings.system")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">{t("settings.language")}</p>
              <div className="flex gap-1.5">
                {(["en", "bn"] as Locale[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`pill flex-1 text-[12px] ${prefs.language === value ? "pill-active" : ""}`}
                    onClick={() => setLanguage(value)}
                  >
                    {value === "en" ? "English" : "বাংলা"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">{t("settings.animations")}</p>
              <div className="flex gap-1.5">
                {(["full", "lite"] as AnimationLevel[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`pill flex-1 text-[12px] ${prefs.animationLevel === value ? "pill-active" : ""}`}
                    onClick={() => setAnimationLevel(value)}
                  >
                    {value === "full" ? t("settings.full") : t("settings.lite")}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5">
              <span>
                <span className="block text-[13px]">{t("settings.reduceMotion")}</span>
                <span className="muted tiny block">{t("settings.reduceMotionHint")}</span>
              </span>
              <Toggle checked={prefs.reduceMotion} onChange={setReduceMotion} label={t("settings.reduceMotion")} />
            </label>
          </div>
        </SectionCard>

        <SectionCard title={t("settings.storage")} id="storage">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[13px]">
              <span>{t("settings.cache")}</span>
              <span className="font-semibold">{cacheSize}</span>
            </div>
            <p className="muted tiny">{t("settings.cacheHint")}</p>
            <button type="button" className="btn btn-ghost w-full" onClick={() => void clearLocalData()}>
              <Trash2 size={15} /> {t("settings.clearData")}
            </button>
            <div className="border-t border-[var(--border)] pt-2">
              {standalone ? (
                <p className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--success)" }}>
                  <Check size={14} /> {t("settings.installed")}
                </p>
              ) : installPrompt ? (
                <button
                  type="button"
                  className="btn btn-soft w-full"
                  onClick={async () => {
                    await installPrompt.prompt();
                    setInstallPrompt(null);
                  }}
                >
                  <Download size={15} /> {t("settings.install")}
                </button>
              ) : (
                <p className="muted tiny">{t("settings.installUnavailable")}</p>
              )}
              <p className="muted tiny mt-1.5">{t("settings.installHint")}</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={t("settings.deleteTitle")}
        body={`${t("settings.deleteWarn")}\n\n${t("settings.deleteHint")}`}
        confirmLabel={t("settings.deleteAccount")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void deleteAccount()}
        onClose={() => setDeleteOpen(false)}
        busy={deleteBusy}
      >
        <div className="flex flex-col gap-2">
          <input className="field" placeholder={t("settings.typeDelete")} value={deleteWord} onChange={(e) => setDeleteWord(e.target.value)} />
          <input className="field" type="password" placeholder={t("settings.passwordToConfirm")} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={clearOpen}
        title={t("settings.clearTitle")}
        body={`${t("settings.clearBody")}\n\n${t("settings.clearQueued")}`}
        confirmLabel={t("settings.clearData")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void clearLocalData()}
        onClose={() => setClearOpen(false)}
      />
    </>
  );
}
