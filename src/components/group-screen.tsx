"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, MoreVertical, Plus, Settings2, UserPlus } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { useViewer } from "./media-viewer-provider";
import { Avatar, ConfirmDialog, EmptyState, ErrorState, NameWithTag, Sheet, Spinner } from "./ui";
import { ChatScreen } from "./chat-screen";
import { TasksScreen } from "./tasks-screen";
import { MeetingsScreen } from "./meetings-screen";
import { ACCENT_COLORS, GROUP_ACCENTS, GROUP_ICONS, GroupGlyph } from "./group-glyph";
import { thumbUrl, type MediaItem } from "@/lib/media-types";
import type { GroupDetail } from "@/app/api/groups/route";
import type { ChatPayload } from "@/lib/chat-types";

type Tab = "chat" | "files" | "members" | "tasks" | "meeting";

export function GroupScreen({ groupId }: { groupId: string }) {
  const { t, toast, locale } = useApp();
  const { open: openViewer } = useViewer();
  const router = useRouter();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberAction, setMemberAction] = useState<GroupDetail["members"][number] | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileFilter, setFileFilter] = useState<"all" | "image" | "video" | "audio" | "document">("all");
  const [editDraft, setEditDraft] = useState({ name: "", description: "", accent: "blue", icon: "people", postRestricted: false });
  const [people, setPeople] = useState<{ id: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    const result = await api<GroupDetail>(`/api/groups?id=${groupId}`);
    if (result.ok) {
      setDetail(result.data);
      setEditDraft({
        name: result.data.group.name,
        description: result.data.group.description,
        accent: result.data.group.accent,
        icon: result.data.group.icon,
        postRestricted: result.data.group.postRestricted,
      });
      setError(false);
    } else {
      setError(true);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!membersOpen || people.length) return;
    void api<{ members: { id: string; displayName: string; avatarUrl: string | null }[] }>("/api/home").then((result) => {
      if (result.ok) setPeople(result.data.members);
    });
  }, [membersOpen, people.length]);

  const onHeaderMeta = useCallback((payload: ChatPayload) => {
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            members: payload.members,
            group: prev.group,
          }
        : prev,
    );
  }, []);

  const action = async (body: Record<string, unknown>, successMessage?: string) => {
    setBusy(true);
    const result = await api("/api/groups", { method: "POST", body: { groupId, ...body } });
    setBusy(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return false;
    }
    if (successMessage) toast(successMessage, "success");
    await load();
    return true;
  };

  const filteredFiles = useMemo(() => {
    if (!detail) return [];
    return detail.files.filter((file) =>
      fileFilter === "all"
        ? true
        : fileFilter === "audio"
          ? file.kind === "audio" || file.kind === "voice"
          : file.kind === fileFilter,
    );
  }, [detail, fileFilter]);

  const openFile = (file: MediaItem) => {
    openViewer({
      title: detail?.group.name ?? t("groups.files"),
      items: filteredFiles,
      index: Math.max(filteredFiles.findIndex((entry) => entry.id === file.id), 0),
    });
  };

  if (error) {
    return (
      <div className="screen pt-6">
        <ErrorState message={t("chat.loadFailed")} retryLabel={t("common.retry")} onRetry={() => void load()} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="screen flex items-center justify-center pt-10">
        <Spinner size={24} />
      </div>
    );
  }

  const accent = ACCENT_COLORS[detail.group.accent] ?? ACCENT_COLORS.blue;

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 4px)" }}>
      <div className="flex items-center gap-2 px-2.5 py-2" style={{ borderBottom: `1px solid ${accent}55`, background: `linear-gradient(120deg, ${accent}22, transparent)` }}>
        <Link href="/groups" className="flex h-10 w-10 flex-none items-center justify-center" aria-label={t("common.back")}>
          <ArrowLeft size={18} />
        </Link>
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px]" style={{ border: `1.6px solid ${accent}`, color: accent }}>
          <GroupGlyph icon={detail.group.icon} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-bold uppercase tracking-wide">{detail.group.name}</p>
          <p className="muted tiny">
            {t("groups.memberCount", { count: detail.members.length })} · {t("groups.onlineCount", { count: detail.members.filter((member) => member.online).length })}
          </p>
        </div>
        <button type="button" className="flex h-10 w-10 items-center justify-center" aria-label={t("groups.groupInfo")} onClick={() => setMenuOpen(true)}>
          <MoreVertical size={18} />
        </button>
      </div>

      <div className="flex gap-1.5 px-2.5 py-2">
        {(["chat", "files", "members", "tasks", "meeting"] as Tab[]).map((value) => (
          <button key={value} type="button" className={`pill flex-1 text-[12px] ${tab === value ? "pill-active" : ""}`} onClick={() => setTab(value)}>
            {value === "chat" ? t("groups.chat") : value === "files" ? t("groups.files") : value === "members" ? t("groups.membersTab") : value === "tasks" ? t("groupTasks.tab") : t("groupTasks.meeting")}
          </button>
        ))}
      </div>

      {tab === "chat" ? (
        <ChatScreen
          kind="group"
          id={groupId}
          embedded
          height="calc(100dvh - 248px - env(safe-area-inset-bottom))"
          onHeaderMeta={onHeaderMeta}
        />
      ) : null}

      {tab === "tasks" ? (
        <div style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
          <TasksScreen groupId={groupId} />
        </div>
      ) : null}

      {tab === "meeting" ? (
        <div style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
          <MeetingsScreen groupId={groupId} embedded />
        </div>
      ) : null}

      {tab === "files" ? (
        <div className="screen flex flex-col gap-2" style={{ paddingTop: 0, paddingBottom: "calc(104px + env(safe-area-inset-bottom))" }}>
          <div className="flex gap-1 overflow-x-auto hide-scroll">
            {([
              ["all", t("chat.fileFilterAll")],
              ["image", t("chat.photos")],
              ["video", t("chat.videos")],
              ["audio", t("chat.audio")],
              ["document", t("chat.documents")],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" className={`pill min-h-[30px] flex-none px-2.5 text-[11px] ${fileFilter === value ? "pill-active" : ""}`} onClick={() => setFileFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          {filteredFiles.length === 0 ? <EmptyState icon={<FileText size={20} />} title={t("groups.noFiles")} body={t("groups.filesNote")} /> : null}
          <div className="grid grid-cols-3 gap-1.5">
            {filteredFiles.map((file) => (
              <button key={file.id} type="button" onClick={() => openFile(file)} className="relative aspect-square overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--card)]" aria-label={file.name}>
                {file.expired ? (
                  <span className="flex h-full flex-col items-center justify-center gap-1 px-1 text-center text-[9px] text-[var(--text-2)]">
                    <FileText size={16} /> {t("viewer.expired")}
                  </span>
                ) : file.kind === "image" || file.kind === "video" ? (
                  <img src={thumbUrl(file)} alt="" width={140} height={140} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full flex-col items-center justify-center gap-1 px-1 text-center">
                    <FileText size={18} />
                    <span className="line-clamp-2 text-[9px]">{file.name}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "members" ? (
        <div className="screen flex flex-col gap-2" style={{ paddingTop: 0, paddingBottom: "calc(104px + env(safe-area-inset-bottom))" }}>
          {detail.canManage ? (
            <div className="flex gap-1.5">
              <button type="button" className="btn btn-soft flex-1" onClick={() => setMembersOpen(true)}>
                <UserPlus size={15} /> {t("groups.addMember")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(true)} aria-label={t("groups.edit")}>
                <Settings2 size={16} />
              </button>
            </div>
          ) : null}
          {detail.members.map((member) => (
            <div key={member.id} className="g-card-flat flex items-center gap-2 p-2.5">
              <Avatar name={member.displayName} src={member.avatarUrl} size={36} online={member.online ? true : undefined} />
              <Link href={`/profile/${member.id}`} className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-1">
                  <span className="truncate text-[13.5px] font-semibold">{member.displayName}</span>
                  <NameWithTag name="" role={member.role} title={member.title} size={10.5} />
                </span>
                <span className="muted tiny block">
                  {member.groupRole === "MODERATOR" ? t("groups.makeModerator") : t("groups.membersTab")}
                  {member.mutedUntil ? ` · ${t("groups.mutedToast")}` : ""}
                </span>
              </Link>
              {detail.canManage ? (
                <button type="button" className="flex h-9 w-9 items-center justify-center" aria-label={t("groups.memberList")} onClick={() => setMemberAction(member)}>
                  <MoreVertical size={16} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={detail.group.name}>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn btn-ghost justify-start" onClick={() => { setMenuOpen(false); setInfoOpen(true); }}>
            {t("groups.groupInfo")}
          </button>
          <div className="rounded-[10px] border border-[var(--border)] p-2">
            <p className="mb-1 text-[12px] font-semibold">{t("groups.notifications")}</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { hours: 1, label: t("groups.mute1h") },
                { hours: 8, label: t("groups.mute8h") },
                { hours: 168, label: t("groups.muteWeek") },
                { hours: 876000, label: t("groups.muteAlways") },
                { hours: 0, label: t("groups.unmute") },
              ].map((option) => (
                <button
                  key={option.hours}
                  type="button"
                  className="pill min-h-[30px] px-2.5 text-[11px]"
                  onClick={async () => {
                    const ok = await action({ action: "mute", hours: option.hours }, option.hours ? t("groups.mutedToast") : t("groups.unmutedToast"));
                    if (ok) setMenuOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-ghost justify-start" onClick={() => { setMenuOpen(false); setTab("files"); }}>
            {t("chat.mediaFiles")}
          </button>
          {detail.canManage ? (
            <>
              <button type="button" className="btn btn-ghost justify-start" onClick={() => { setMenuOpen(false); setEditOpen(true); }}>
                {t("groups.edit")}
              </button>
              <button
                type="button"
                className="btn btn-ghost justify-start"
                onClick={() => void action({ action: "update", postRestricted: !detail.group.postRestricted }, t("groups.saved"))}
              >
                {detail.group.postRestricted ? t("groups.restricted") : t("groups.postRestrictedToggle")}
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-ghost justify-start" onClick={() => { setMenuOpen(false); setLeaveOpen(true); }}>
            {t("groups.leave")}
          </button>
          {detail.canManage ? (
            <button type="button" className="btn btn-danger justify-start" onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}>
              {t("groups.delete")}
            </button>
          ) : null}
        </div>
      </Sheet>

      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} title={t("groups.infoTitle")}>
        <div className="flex flex-col gap-2 text-[12.5px]">
          <div className="flex items-center gap-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-[12px]" style={{ border: `1.6px solid ${accent}`, color: accent }}>
              <GroupGlyph icon={detail.group.icon} size={28} />
            </span>
            <div>
              <p className="text-[14px] font-semibold">{detail.group.name}</p>
              <p className="muted tiny">{t("groups.memberCount", { count: detail.members.length })} · {t("groups.onlineCount", { count: detail.members.filter((member) => member.online).length })}</p>
            </div>
          </div>
          <p className="muted">{detail.group.description}</p>
          <p className="muted tiny">{t("groups.createdBy", { name: detail.members.find((member) => member.role === "OWNER")?.displayName ?? "—" })}</p>
          <p className="muted tiny">{new Date(detail.createdAt).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB")}</p>
        </div>
      </Sheet>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t("groups.edit")}>
        <div className="flex flex-col gap-3">
          <input className="field" value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} maxLength={60} />
          <textarea className="field" value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} maxLength={200} rows={3} />
          <div className="flex flex-wrap gap-1.5">
            {GROUP_ICONS.map((icon) => (
              <button key={icon} type="button" onClick={() => setEditDraft({ ...editDraft, icon })} className="flex h-10 w-10 items-center justify-center rounded-[10px] border" style={{ borderColor: editDraft.icon === icon ? accent : "var(--border)", color: accent }} aria-label={icon}>
                <GroupGlyph icon={icon} size={22} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GROUP_ACCENTS.map((value) => (
              <button key={value} type="button" aria-label={value} onClick={() => setEditDraft({ ...editDraft, accent: value })} className="h-8 w-8 rounded-full border-2" style={{ background: ACCENT_COLORS[value], borderColor: editDraft.accent === value ? "#fff" : "transparent" }} />
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              const ok = await action({ action: "update", ...editDraft }, t("groups.saved"));
              if (ok) setEditOpen(false);
            }}
          >
            {busy ? <Spinner /> : null} {t("common.save")}
          </button>
        </div>
      </Sheet>

      <Sheet open={membersOpen} onClose={() => { setMembersOpen(false); setSelected([]); }} title={t("groups.addMember")}>
        <div className="flex flex-col gap-2">
          {people.length === 0 ? <p className="muted tiny">{t("groups.noneSelected")}</p> : null}
          {people.map((person) => (
            <label key={person.id} className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--blue)]"
                checked={selected.includes(person.id)}
                onChange={(event) => setSelected(event.target.checked ? [...selected, person.id] : selected.filter((id) => id !== person.id))}
              />
              <Avatar name={person.displayName} src={person.avatarUrl} size={22} />
              {person.displayName}
            </label>
          ))}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !selected.length}
            onClick={async () => {
              const ok = await action({ action: "addMembers", userIds: selected }, t("groups.addedToast"));
              if (ok) {
                setMembersOpen(false);
                setSelected([]);
              }
            }}
          >
            <Plus size={15} /> {t("groups.addMember")}
          </button>
        </div>
      </Sheet>

      <Sheet open={Boolean(memberAction)} onClose={() => setMemberAction(null)} title={memberAction?.displayName ?? t("groups.memberList")}>
        {memberAction ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-ghost justify-start"
              onClick={async () => {
                const ok = await action({ action: "role", userId: memberAction.id, role: memberAction.groupRole === "MODERATOR" ? "MEMBER" : "MODERATOR" }, t("groups.roleUpdated"));
                if (ok) setMemberAction(null);
              }}
            >
              {memberAction.groupRole === "MODERATOR" ? t("groups.makeMember") : t("groups.makeModerator")}
            </button>
            <button
              type="button"
              className="btn btn-ghost justify-start"
              onClick={async () => {
                const ok = await action({ action: "mute", userId: memberAction.id, hours: 24 }, t("groups.mutedToast"));
                if (ok) setMemberAction(null);
              }}
            >
              {t("groups.mute1h")}
            </button>
            <button
              type="button"
              className="btn btn-danger justify-start"
              onClick={async () => {
                const ok = await action({ action: "remove-member", userId: memberAction.id }, t("groups.removedToast"));
                if (ok) setMemberAction(null);
              }}
            >
              {t("groups.removeMember")}
            </button>
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={leaveOpen}
        title={t("groups.leaveTitle")}
        body={t("groups.leaveBody")}
        confirmLabel={t("groups.leave")}
        cancelLabel={t("common.cancel")}
        onConfirm={async () => {
          const ok = await action({ action: "leave" }, t("groups.left"));
          if (ok) router.push("/groups");
        }}
        onClose={() => setLeaveOpen(false)}
        busy={busy}
      />

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("groups.deleteTitle")}>
        <p className="muted mb-2 text-[12.5px]">{t("groups.deleteBody")}</p>
        <p className="label">{t("groups.deleteConfirm")}</p>
        <input className="field mb-2" value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={detail.group.name} />
        <p className="muted tiny mb-2">{t("groups.deleteHint")}</p>
        <button
          type="button"
          className="btn btn-danger w-full"
          disabled={busy || deleteName !== detail.group.name}
          onClick={async () => {
            const ok = await action({ action: "delete", confirmName: deleteName });
            if (ok) router.push("/groups");
          }}
        >
          {busy ? <Spinner /> : null} {t("groups.delete")}
        </button>
      </Sheet>

      {membersOpen ? null : null}
    </div>
  );
}
