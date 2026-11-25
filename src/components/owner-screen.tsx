"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Bell, Check, Database, Download, Flag, KeyRound, Link2, Lock, Megaphone, QrCode, Settings2, ShieldCheck, Trash2, Upload, Users, Wrench } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { useViewer } from "./media-viewer-provider";
import { Avatar, EmptyState, ErrorState, Spinner, Toggle } from "./ui";
import { Plus } from "lucide-react";
import { RegistrationSettings } from "./registration-settings";
import { prepareUpload, uploadMedia } from "@/lib/upload-client";
import { formatDateShort, formatDateTime } from "@/lib/time";
import { formatBytes } from "@/lib/media-types";
import type { MessageKey } from "@/i18n";

const SECTIONS: { key: string; label: MessageKey; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "owner.dashboard", icon: <Database size={14} /> },
  { key: "members", label: "owner.members", icon: <Users size={14} /> },
  { key: "admins", label: "owner.admins", icon: <ShieldCheck size={14} /> },
  { key: "permissions", label: "owner.permissions", icon: <KeyRound size={14} /> },
  { key: "groups", label: "owner.groups", icon: <Users size={14} /> },
  { key: "invites", label: "owner.invites", icon: <Link2 size={14} /> },
  { key: "branding", label: "owner.branding", icon: <Upload size={14} /> },
  { key: "reviews", label: "owner.reviews", icon: <Settings2 size={14} /> },
  { key: "reports", label: "owner.moderation", icon: <Flag size={14} /> },
  { key: "bans", label: "owner.bans", icon: <Ban size={14} /> },
  { key: "security", label: "owner.security", icon: <Lock size={14} /> },
  { key: "audit", label: "owner.audit", icon: <ShieldCheck size={14} /> },
  { key: "storage", label: "owner.storage", icon: <Trash2 size={14} /> },
  { key: "notifications", label: "owner.notifications", icon: <Megaphone size={14} /> },
  { key: "system", label: "owner.system", icon: <Wrench size={14} /> },
];

export function OwnerScreen({ section }: { section: string }) {
  const { t } = useApp();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api(`/api/owner?section=${section}`);
    setLoading(false);
    if (result.ok) {
      setData(result.data);
      setError(false);
    } else setError(true);
  }, [section]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <Link href="/profile" className="icon-btn h-9 w-9" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>
        <p className="flex items-center gap-1.5 text-[15px] font-semibold"><ShieldCheck size={16} style={{ color: "var(--owner)" }} /> {t("owner.title")}</p>
      </div>
      <div className="hide-scroll flex gap-1.5 overflow-x-auto px-3 py-2">
        {SECTIONS.map((entry) => (
          <button key={entry.key} type="button" className={`pill min-h-[28px] flex-none px-2.5 text-[10.5px] ${section === entry.key ? "pill-active" : ""}`} onClick={() => router.push(`/owner/${entry.key}`)}>
            {entry.icon} {t(entry.label)}
          </button>
        ))}
      </div>
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 0 }}>
        {error ? <ErrorState message={t("errors.forbiddenBody")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {loading && !data ? <div className="flex justify-center py-6"><Spinner size={22} /></div> : null}
        {data ? <Section section={section} data={data} reload={load} /> : null}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Section({ section, data, reload }: { section: string; data: any; reload: () => Promise<void> }) {
  const { t, toast, locale } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const act = async (payload: Record<string, unknown>, message?: string, key = "common.save") => {
    setBusy(key);
    const result = await api("/api/owner", { method: "POST", body: payload });
    setBusy(null);
    if (!result.ok) {
      toast(result.data.error === "owner_protected" ? t("owner.ownerProtected") : t("common.error"), "error");
      return false;
    }
    if (message) toast(message, "success");
    await reload();
    return true;
  };

  if (section === "dashboard") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[
          [t("owner.members"), data.counts.members],
          [t("owner.onlineNow"), data.counts.online],
          [t("owner.groups"), data.counts.groups],
          [t("owner.pendingReports"), data.counts.pendingReports],
          [t("owner.storageUsed"), formatBytes(data.counts.bytes)],
          [t("owner.lastCleanup"), data.lastCleanup ? `${data.lastCleanup.kind} · ${formatDateShort(data.lastCleanup.startedAt)}` : t("owner.never")],
        ].map(([label, value]) => (
          <div key={String(label)} className="g-card-flat p-2.5">
            <p className="muted tiny">{label}</p>
            <p className="mt-0.5 text-[15px] font-semibold">{value}</p>
          </div>
        ))}
      </div>
    );
  }

  if (section === "members" || section === "admins") {
    return (
      <div className="flex flex-col gap-1.5">
        {data.members.map((member: { id: string; displayName: string; username: string; role: string; title: string | null; banned: boolean; online: boolean; avatarUrl: string | null; email: string | null; createdAt: string }) => (
          <div key={member.id} className="g-card-flat p-2.5">
            <div className="flex items-center gap-2">
              <Avatar name={member.displayName} src={member.avatarUrl} size={32} online={member.online ? true : undefined} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold">{member.displayName} <span className="muted">@{member.username}</span></p>
                <p className="muted tiny">{t(`role.${member.role}` as "role.MEMBER")}{member.title ? ` · ${member.title}` : ""}{member.banned ? ` · ${t("settings.blocked")}` : ""}</p>
                {member.email ? <p className="muted tiny truncate">{member.email}</p> : null}
              </div>
              <Link href={`/profile/${member.id}`} className="text-[10px] underline">{t("owner.openProfile")}</Link>
            </div>
            {member.role !== "OWNER" ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <button type="button" className="pill min-h-[26px] px-2 text-[10px]" onClick={() => void act({ action: "role", userId: member.id, role: member.role === "ADMIN" ? "MEMBER" : "ADMIN" }, t("owner.roleSaved"))}>
                  {member.role === "ADMIN" ? t("role.MEMBER") : t("owner.admins")}
                </button>
                <input className="field min-h-[26px] w-24 px-2 py-0 text-[10px]" placeholder={member.title ?? t("owner.changeTitle")} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
                <button type="button" className="pill min-h-[26px] px-2 text-[10px]" onClick={() => void act({ action: "title", userId: member.id, title: titleDraft }, t("owner.titleSaved"))}>{t("owner.changeTitle")}</button>
                <button type="button" className="pill min-h-[26px] px-2 text-[10px]" onClick={() => void act({ action: "force-signout", userId: member.id }, t("owner.signedOut"))}>{t("owner.forceSignout")}</button>
                <button
                  type="button"
                  className="pill min-h-[26px] px-2 text-[10px]"
                  style={{ color: member.banned ? "var(--success)" : "var(--danger)" }}
                  onClick={() => void act({ action: member.banned ? "unban" : "ban", userId: member.id, reason: "Owner action", hours: 0 }, member.banned ? t("owner.unbanned") : t("owner.banned"))}
                >
                  {member.banned ? t("owner.unban") : t("owner.ban")}
                </button>
              </div>
            ) : <p className="muted tiny mt-1">{t("owner.ownerProtected")}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (section === "permissions") {
    return (
      <div className="g-card p-3">
        <p className="mb-2 text-[12.5px] font-semibold">{t("owner.roleMatrix")}</p>
        {data.capabilities.map((capability: string) => (
          <div key={capability} className="flex items-center gap-1.5 border-b border-[var(--border)] py-1.5 last:border-b-0">
            <span className="flex-1 text-[11px]">{t(`caps.${capability}` as MessageKey)}</span>
            {(["OWNER", "ADMIN", "MEMBER"] as const).map((role) => {
              const enabled = role === "OWNER" ? true : data.roleDefaults[role]?.includes(capability);
              return (
                <button
                  key={role}
                  type="button"
                  disabled={role === "OWNER"}
                  className="pill min-h-[24px] px-1.5 text-[9px]"
                  style={enabled ? { background: "linear-gradient(100deg,#318BFF,#8B4DFF)", color: "#fff", borderColor: "transparent" } : undefined}
                  onClick={() => void act({ action: "permission-role", role, capability, allowed: !enabled }, t("owner.permissionSaved"))}
                >
                  {t(`role.${role}` as "role.MEMBER")}
                </button>
              );
            })}
          </div>
        ))}
        <p className="muted tiny mt-2">{t("owner.userOverrides")}</p>
        {data.overrides.map((row: { userId: string; capability: string; allowed: boolean }) => (
          <p key={`${row.userId}-${row.capability}`} className="muted tiny">{row.userId.slice(0, 8)} · {row.capability} · {row.allowed ? "on" : "off"}</p>
        ))}
      </div>
    );
  }

  if (section === "groups") {
    return (
      <div className="flex flex-col gap-1.5">
        {data.groups.map((group: { id: string; name: string; members: number; accent: string; postRestricted: boolean }) => (
          <div key={group.id} className="g-card-flat flex items-center gap-2 p-2.5">
            <span className="flex-1 truncate text-[12.5px] font-semibold">{group.name}</span>
            <span className="muted tiny">{group.members}</span>
            <Link href={`/groups/${group.id}`} className="text-[10px] underline">{t("groups.openGroup")}</Link>
          </div>
        ))}
      </div>
    );
  }

  if (section === "branding") {
    return <BrandingSection data={data.branding} onSaved={reload} />;
  }

  if (section === "reviews") {
    return (
      <div className="g-card flex flex-col gap-2 p-3">
        <label className="flex items-center justify-between gap-3 text-[12.5px]">
          {t("owner.membersCanPost")}
          <Toggle checked={data.settings.membersCanPostReviews} onChange={(next) => void act({ action: "review-settings", membersCanPostReviews: next, reviewModeration: data.settings.reviewModeration }, t("owner.settingsSaved"))} label={t("owner.membersCanPost")} />
        </label>
        <label className="flex items-center justify-between gap-3 text-[12.5px]">
          {t("owner.moderateReviews")}
          <Toggle checked={data.settings.reviewModeration} onChange={(next) => void act({ action: "review-settings", membersCanPostReviews: data.settings.membersCanPostReviews, reviewModeration: next }, t("owner.settingsSaved"))} label={t("owner.moderateReviews")} />
        </label>
        <Link href="/announcements" className="btn btn-ghost mt-1">{t("ann.title")}</Link>
      </div>
    );
  }

  if (section === "reports") {
    return (
      <div className="flex flex-col gap-1.5">
        {data.reports.length === 0 ? <EmptyState icon={<Flag size={20} />} title={t("reports.emptyQueue")} /> : null}
        {data.reports.map((report: { id: string; targetType: string; targetId: string; reason: string; detail: string | null; status: string; reporter: string; createdAt: string; note: string | null }) => (
          <div key={report.id} className="g-card-flat p-2.5">
            <p className="text-[12.5px] font-semibold">{report.reason} · {report.targetType}</p>
            <p className="muted tiny">{report.reporter} · {formatDateTime(report.createdAt, locale)} · {report.status}</p>
            {report.detail ? <p className="mt-1 text-[11.5px]">{report.detail}</p> : null}
            <div className="mt-1.5 flex items-center gap-1">
              <input className="field min-h-[28px] flex-1 px-2 py-0 text-[10.5px]" placeholder={t("reports.note")} value={note} onChange={(event) => setNote(event.target.value)} />
              {(["REVIEWING", "RESOLVED", "REJECTED"] as const).map((status) => (
                <button key={status} type="button" className="pill min-h-[26px] px-1.5 text-[9.5px]" onClick={() => void act({ action: "report-status", reportId: report.id, status, note }, t("reports.saved"))}>{status}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section === "bans") {
    return (
      <div className="flex flex-col gap-1.5">
        {data.bans.length === 0 ? <EmptyState icon={<Ban size={20} />} title={t("owner.noResults")} /> : null}
        {data.bans.map((ban: { id: string; userId: string; name: string; reason: string; createdAt: string; expiresAt: string | null; liftedAt: string | null }) => (
          <div key={ban.id} className="g-card-flat flex items-center gap-2 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold">{ban.name}</p>
              <p className="muted tiny">{ban.reason} · {formatDateShort(ban.createdAt)}{ban.liftedAt ? ` · ${t("owner.unban")}` : ""}</p>
            </div>
            {!ban.liftedAt ? (
              <button type="button" className="pill min-h-[26px] px-2 text-[10px]" onClick={() => void act({ action: "unban", userId: ban.userId }, t("owner.unbanned"))}>{t("owner.unban")}</button>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  if (section === "security") {
    return (
      <div className="flex flex-col gap-2">
        <div className="g-card p-3">
          <p className="mb-1.5 text-[12.5px] font-semibold">{t("owner.sessions")}</p>
          {data.sessions.slice(0, 12).map((session: { id: string; userId: string; name: string; userAgent: string | null; lastUsedAt: string; revoked: boolean }) => (
            <div key={session.id} className="flex items-center gap-2 border-b border-[var(--border)] py-1 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px]">{session.name}</span>
                <span className="muted tiny block">{formatDateShort(session.lastUsedAt)}{session.revoked ? " · revoked" : ""}</span>
              </span>
              <button type="button" className="muted text-[10px] underline" onClick={() => void act({ action: "force-signout", userId: session.userId }, t("owner.signedOut"))}>{t("owner.forceSignout")}</button>
            </div>
          ))}
        </div>
        <div className="g-card p-3">
          <p className="mb-1.5 text-[12.5px] font-semibold">{t("owner.failedLogins")}</p>
          {data.failedAttempts.slice(0, 12).map((attempt: { kind: string; key: string; createdAt: string }) => (
            <p key={`${attempt.kind}-${attempt.createdAt}`} className="muted tiny">{attempt.kind} · {attempt.key} · {formatDateShort(attempt.createdAt)}</p>
          ))}
        </div>
      </div>
    );
  }

  if (section === "audit") {
    return (
      <div className="g-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12.5px] font-semibold">{t("owner.audit")}</p>
          <a href="/api/owner?section=audit&format=csv" className="muted text-[10.5px] underline"><Download size={11} className="mr-1 inline" />{t("owner.auditExport")}</a>
        </div>
        {data.logs.map((log: { id: string; actorName: string | null; action: string; targetType: string | null; detail: string | null; createdAt: string }) => (
          <p key={log.id} className="muted tiny border-b border-[var(--border)] py-1 last:border-b-0">
            <b>{log.actorName ?? "—"}</b> · {log.action}{log.targetType ? ` · ${log.targetType}` : ""}{log.detail ? ` · ${log.detail}` : ""} · {formatDateTime(log.createdAt, locale)}
          </p>
        ))}
      </div>
    );
  }

  if (section === "invites") {
    return (
      <div className="flex flex-col gap-2">
        <RegistrationSettings />
        <InvitesSection />
      </div>
    );
  }

  if (section === "storage") {
    return <StorageSection data={data} reload={reload} />;
  }

  if (section === "notifications") {
    return <NotifySection data={data} reload={reload} />;
  }

  if (section === "system") {
    return (
      <div className="flex flex-col gap-2">
        <div className="g-card p-3">
          <p className="text-[12.5px] font-semibold">{t("owner.versions")}: {data.version}</p>
          <p className="muted tiny mt-1">{formatDateTime(new Date().toISOString(), locale)}</p>
        </div>
        <div className="g-card p-3">
          <p className="mb-1.5 text-[12.5px] font-semibold">{t("owner.systemChecks")}</p>
          {Object.entries(data.checks).map(([key, value]) => (
            <p key={key} className="flex items-center justify-between border-b border-[var(--border)] py-1 text-[11.5px] last:border-b-0">
              <span>{key === "push" ? t("owner.push") : key === "email" ? t("owner.email") : key === "realtime" ? t("owner.realtime") : key === "cron" ? t("owner.cron") : key}</span>
              <span style={{ color: value ? "var(--success)" : "var(--warning)" }}>{value ? t("owner.configured") : t("owner.missing")}</span>
            </p>
          ))}
        </div>
        <div className="g-card p-3">
          <p className="mb-1.5 text-[12.5px] font-semibold">{t("owner.envStatus")}</p>
          {data.env.map((entry: { key: string; configured: boolean; note: string }) => (
            <p key={entry.key} className="flex items-center justify-between border-b border-[var(--border)] py-1 text-[10.5px] last:border-b-0">
              <span className="truncate">{entry.key}</span>
              <span style={{ color: entry.configured ? "var(--success)" : "var(--warning)" }}>{entry.configured ? t("owner.configured") : t("owner.missing")}</span>
            </p>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function BrandingSection({ data, onSaved }: { // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any; onSaved: () => Promise<void> }) {
  const { t, toast } = useApp();
  const [logo, setLogo] = useState<string | null>(data.logoMediaId);
  const [banner, setBanner] = useState<string | null>(data.bannerMediaId);
  const [name, setName] = useState(data.appName);
  const [tagline, setTagline] = useState(data.tagline);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File, target: "logo" | "banner") => {
    setBusy(true);
    try {
      const prepared = await prepareUpload(file);
      const uploaded = await uploadMedia(file, file.name, prepared);
      if (target === "logo") setLogo(uploaded.id);
      else setBanner(uploaded.id);
      toast(t("owner.brandingSaved"), "success");
    } catch {
      toast(t("chat.uploadFailed"), "error");
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="g-card p-3">
        <p className="mb-1.5 text-[12.5px] font-semibold">{t("owner.brandingPreview")}</p>
        <div className="relative overflow-hidden rounded-[14px] border border-[var(--border)]" style={{ aspectRatio: "11 / 3", background: "#0A1224" }}>
          {banner ? <img src={`/api/media/${banner}`} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[11px] text-white/60">{t("owner.uploadBanner")}</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[var(--border)]">
            {logo ? <img src={`/api/media/${logo}`} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px]">{t("owner.uploadLogo")}</span>}
          </span>
          <span className="text-[13px] font-semibold">{name}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <label className="btn btn-ghost cursor-pointer text-[11px]">
            <Upload size={13} /> {t("owner.uploadLogo")}
            <input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file, "logo"); }} />
          </label>
          <label className="btn btn-ghost cursor-pointer text-[11px]">
            <Upload size={13} /> {t("owner.uploadBanner")}
            <input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file, "banner"); }} />
          </label>
        </div>
        <input className="field mt-2" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} aria-label={t("about.app")} />
        <input className="field mt-1.5" value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={80} aria-label={t("auth.tagline")} />
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            className="btn btn-primary flex-1"
            disabled={busy}
            onClick={async () => {
              const result = await api("/api/owner", { method: "POST", body: { action: "branding", logoMediaId: logo ?? "", bannerMediaId: banner ?? "", appName: name, tagline } });
              if (!result.ok) {
                toast(t("common.error"), "error");
                return;
              }
              toast(t("owner.brandingSaved"), "success");
              await onSaved();
            }}
          >
            {busy ? <Spinner /> : <Check size={14} />} {t("common.save")}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              await api("/api/owner", { method: "POST", body: { action: "branding", reset: true } });
              setLogo(null);
              setBanner(null);
              await onSaved();
            }}
          >
            {t("owner.resetBranding")}
          </button>
        </div>
      </div>
      <p className="muted tiny">{name} · 11:3 banner, square logo</p>
    </div>
  );
}

function StorageSection({ data, reload }: { // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any; reload: () => Promise<void> }) {
  const { t, toast } = useApp();
  const [confirm, setConfirm] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="g-card p-3">
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div><p className="muted tiny">{t("owner.storageUsed")}</p><p className="font-semibold">{formatBytes(data.bytes)}</p></div>
          <div><p className="muted tiny">{t("owner.pendingReports")}</p><p className="font-semibold">{data.pendingExpiry}</p></div>
          <div><p className="muted tiny">Files</p><p className="font-semibold">{data.files}</p></div>
          <div><p className="muted tiny">{t("owner.lastCleanup")}</p><p className="font-semibold">{data.lastCleanup ? data.lastCleanup.status : t("owner.never")}</p></div>
        </div>
        <p className="muted tiny mt-2">{data.nextCleanupHint}</p>
      </div>
      <div className="g-card p-3">
        <p className="mb-1.5 text-[12.5px] font-semibold">{t("owner.cleanupNow")}</p>
        <label className="flex items-center gap-2 text-[11.5px]">
          <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} className="h-4 w-4 accent-[var(--blue)]" />
          {t("owner.dryRun")}
        </label>
        <input className="field mt-1.5" placeholder={t("owner.cleanupConfirm")} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        <button
          type="button"
          className="btn btn-danger mt-1.5 w-full"
          disabled={busy || confirm !== "CLEANUP"}
          onClick={async () => {
            setBusy(true);
            const result = await api("/api/owner", { method: "POST", body: { action: "cleanup-now", confirm, dryRun } });
            setBusy(false);
            if (!result.ok) {
              toast(t("common.error"), "error");
              return;
            }
            toast(t("owner.cleanupDone"), "success");
            setConfirm("");
            await reload();
          }}
        >
          {busy ? <Spinner /> : <Trash2 size={14} />} {t("owner.cleanupNow")}
        </button>
      </div>
      <div className="g-card p-3">
        <p className="mb-1.5 text-[12.5px] font-semibold">{t("owner.jobs")}</p>
        {data.jobs.map((job: { id: string; kind: string; status: string; dryRun: boolean; startedAt: string; counts: string | null }) => (
          <p key={job.id} className="muted tiny border-b border-[var(--border)] py-1 last:border-b-0">
            {job.kind} · {job.status}{job.dryRun ? " · dry" : ""} · {formatDateShort(job.startedAt)} · {job.counts ?? "—"}
          </p>
        ))}
      </div>
    </div>
  );
}

function NotifySection({ data, reload }: { // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any; reload: () => Promise<void> }) {
  const { t, toast } = useApp();
  const [audience, setAudience] = useState<"all" | "group" | "user">("all");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="g-card flex flex-col gap-2 p-3">
      <div className="flex gap-1.5">
        {(["all", "group", "user"] as const).map((option) => (
          <button key={option} type="button" className={`pill flex-1 text-[11px] ${audience === option ? "pill-active" : ""}`} onClick={() => setAudience(option)}>
            {option === "all" ? t("owner.audienceAll") : option === "group" ? t("owner.audienceGroup") : t("owner.audienceUser")}
          </button>
        ))}
      </div>
      {audience === "group" ? (
        <select className="field" value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">{t("owner.audienceGroup")}</option>
          {data.groups.map((group: { id: string; name: string }) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      ) : null}
      {audience === "user" ? (
        <select className="field" value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">{t("owner.audienceUser")}</option>
          {data.members.map((member: { id: string; displayName: string }) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
        </select>
      ) : null}
      <input className="field" placeholder={t("owner.notifyTitle")} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} />
      <textarea className="field" rows={3} placeholder={t("owner.notifyBody")} value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || title.trim().length < 3}
        onClick={async () => {
          setBusy(true);
          const result = await api("/api/owner", { method: "POST", body: { action: "notify", audience, groupId: audience === "group" ? target : "", userId: audience === "user" ? target : "", title, body } });
          setBusy(false);
          if (!result.ok) {
            toast(t("common.error"), "error");
            return;
          }
          toast(t("owner.notifySent"), "success");
          setTitle("");
          setBody("");
          await reload();
        }}
      >
        {busy ? <Spinner /> : <Bell size={14} />} {t("owner.notifySend")}
      </button>
    </div>
  );
}

export function InvitesSection() {
  const { t, toast } = useApp();
  const [data, setData] = useState<{ invites: { id: string; code: string; groupName: string | null; uses: number; maxUses: number | null; approvalRequired: boolean; expiresAt: string | null; revokedAt: string | null; createdAt: string }[]; joinRequests: { id: string; name: string; inviteId: string | null }[] } | null>(null);
  const [mode, setMode] = useState("both");
  const [expiry, setExpiry] = useState("7d");
  const [maxUses, setMaxUses] = useState("0");
  const [approvalRequired, setApproval] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = useState("");
  const [created, setCreated] = useState<{ code: string; token: string } | null>(null);

  const load = useCallback(async () => {
    const result = await api<NonNullable<typeof data>>("/api/invites");
    if (result.ok) setData(result.data);
    const groupsResult = await api<{ groups: { id: string; name: string }[] }>("/api/owner?section=groups");
    if (groupsResult.ok) setGroups(groupsResult.data.groups);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-2">
      <div className="g-card p-3">
        <p className="mb-1.5 text-[12.5px] font-semibold">{t("owner.inviteNew")}</p>
        <div className="flex gap-1.5">
          {["link", "code", "both"].map((option) => (
            <button key={option} type="button" className={`pill flex-1 text-[10.5px] ${mode === option ? "pill-active" : ""}`} onClick={() => setMode(option)}>{option}</button>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <select className="field min-h-[34px] text-[11px]" value={expiry} onChange={(event) => setExpiry(event.target.value)}>
            {["never", "1h", "6h", "1d", "7d", "30d"].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <input className="field min-h-[34px] text-[11px]" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder={t("owner.inviteMaxUses")} />
        </div>
        <select className="field mt-1.5" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
          <option value="">{t("meetings.noGroup")}</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <label className="mt-1.5 flex items-center gap-2 text-[11px]">
          <input type="checkbox" checked={approvalRequired} onChange={(event) => setApproval(event.target.checked)} className="h-4 w-4 accent-[var(--blue)]" />
          {t("owner.inviteApproval")}
        </label>
        <button
          type="button"
          className="btn btn-primary mt-1.5 w-full"
          onClick={async () => {
            const result = await api<{ code: string; token: string }>("/api/invites", { method: "POST", body: { action: "create", mode, expiry, maxUses: Number(maxUses), approvalRequired, groupId } });
            if (!result.ok) {
              toast(t("common.error"), "error");
              return;
            }
            setCreated({ code: result.data.code, token: result.data.token });
            toast(t("owner.inviteCreated"), "success");
            await load();
          }}
        >
          <Plus size={14} className="mr-1 inline" />{t("owner.inviteNew")}
        </button>
        {created ? (
          <div className="mt-1.5 rounded-[8px] bg-[var(--surface)] p-2 text-[11px]">
            <p>Code: <b>{created.code}</b></p>
            <p className="break-all">Link: {typeof window !== "undefined" ? window.location.origin : ""}/join/{created.code}</p>
          </div>
        ) : null}
      </div>
      {(data?.invites ?? []).map((invite) => (
        <div key={invite.id} className="g-card-flat flex items-center gap-2 p-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold">{invite.code} {invite.approvalRequired ? `· ${t("owner.inviteApproval")}` : ""}</p>
            <p className="muted tiny">{invite.groupName ?? t("meetings.noGroup")} · {invite.uses}/{invite.maxUses ?? "∞"} · {invite.expiresAt ? formatDateShort(invite.expiresAt) : "∞"}{invite.revokedAt ? " · revoked" : ""}</p>
          </div>
          {!invite.revokedAt ? (
            <button type="button" className="pill min-h-[26px] px-2 text-[10px]" onClick={async () => { await api("/api/invites", { method: "POST", body: { action: "revoke", inviteId: invite.id } }); toast(t("owner.inviteRevoked"), "success"); await load(); }}>
              {t("owner.revoke")}
            </button>
          ) : null}
        </div>
      ))}
      {(data?.joinRequests ?? []).map((request) => (
        <div key={request.id} className="g-card-flat flex items-center gap-2 p-2.5">
          <span className="flex-1 text-[12px]">{request.name}</span>
          <button type="button" className="pill min-h-[26px] px-2 text-[10px]" onClick={async () => { await api("/api/invites", { method: "POST", body: { action: "decide", requestId: request.id, approve: true } }); await load(); }}>{t("owner.approve")}</button>
          <button type="button" className="pill min-h-[26px] px-2 text-[10px]" onClick={async () => { await api("/api/invites", { method: "POST", body: { action: "decide", requestId: request.id, approve: false } }); await load(); }}>{t("owner.reject")}</button>
        </div>
      ))}
      <p className="muted tiny flex items-center gap-1"><QrCode size={11} /> /join/[code]</p>
    </div>
  );
}


