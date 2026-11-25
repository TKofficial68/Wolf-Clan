"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, FolderKanban, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { useViewer } from "./media-viewer-provider";
import { formatBytes, thumbUrl, type MediaItem } from "@/lib/media-types";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { Avatar, EmptyState, ErrorState, ListSkeleton, ScreenHeader, Sheet, Spinner } from "./ui";
import { PermanentDeleteDialog } from "./permanent-delete";
import { TaskCard, TaskFormSheet } from "./tasks-screen";
import { formatDateShort } from "@/lib/time";

type ProjectItem = {
  id: string;
  name: string;
  description: string;
  status: string;
  deadline: string | null;
  createdAt: string;
  creatorName: string | null;
  members: { id: string; displayName: string; avatarUrl: string | null }[];
  taskCount: number;
  doneCount: number;
};

const STATUS_KEYS: Record<string, "projects.planning" | "projects.active" | "projects.onHold" | "projects.completed"> = {
  PLANNING: "projects.planning",
  ACTIVE: "projects.active",
  ON_HOLD: "projects.onHold",
  COMPLETED: "projects.completed",
};

export function ProjectsScreen({ startCreating = false }: { startCreating?: boolean }) {
  const { t, toast } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<ProjectItem[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "mine">("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ filter });
    if (query.trim()) params.set("q", query.trim());
    const result = await api<{ items: ProjectItem[]; canManage: boolean }>(`/api/projects?${params.toString()}`);
    if (result.ok) {
      setItems(result.data.items);
      setCanManage(result.data.canManage);
      setError(false);
    } else setError(true);
  }, [filter, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (startCreating && canManage) setCreateOpen(true);
  }, [startCreating, canManage]);

  return (
    <>
      <ScreenHeader
        title={t("projects.title")}
        art="/brand/header-group.webp"
        back={
          <Link href="/menu" className="icon-btn h-9 w-9" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>
        }
        right={canManage ? (
          <button type="button" className="icon-btn" aria-label={t("projects.new")} onClick={() => setCreateOpen(true)}><Plus size={18} /></button>
        ) : undefined}
      />
      <div className="screen flex flex-col gap-2" style={{ paddingTop: 10 }}>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-2)]" />
          <input className="field pl-9 pr-9" placeholder={t("projects.search")} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("projects.search")} />
          {query ? <button type="button" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center" onClick={() => setQuery("")} aria-label={t("common.close")}><X size={14} /></button> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["all", t("projects.all")],
            ["active", t("projects.active")],
            ["completed", t("projects.completed")],
            ["mine", t("projects.mine")],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={`pill min-h-[32px] px-2.5 text-[11.5px] ${filter === value ? "pill-active" : ""}`} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>

        {error && !items ? <ErrorState message={t("projects.loadFailed")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {!items && !error ? <ListSkeleton rows={3} /> : null}
        {items && items.length === 0 ? (
          <EmptyState
            icon={<FolderKanban size={22} />}
            title={t("projects.emptyTitle")}
            body={t("projects.emptyBody")}
            action={canManage ? <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> {t("projects.new")}</button> : undefined}
          />
        ) : null}

        {items?.map((project) => {
          const percent = project.taskCount ? Math.round((project.doneCount / project.taskCount) * 100) : 0;
          return (
            <Link key={project.id} href={`/projects/${project.id}`} className="g-card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[15px] font-semibold">{project.name}</p>
                <span className="pill min-h-[24px] px-2 text-[9.5px]">{t(STATUS_KEYS[project.status] ?? "projects.planning")}</span>
              </div>
              <p className="muted mt-0.5 line-clamp-2 text-[11.5px]">{project.description || t("projects.noActivity")}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <div className="flex -space-x-1.5">
                  {project.members.slice(0, 4).map((member) => (
                    <Avatar key={member.id} name={member.displayName} src={member.avatarUrl} size={22} ring={false} />
                  ))}
                </div>
                <span className="muted tiny">{project.members.length} · {project.taskCount} {t("projects.tasks")}</span>
                <span className="muted tiny ml-auto">{project.deadline ? formatDateShort(project.deadline) : "—"}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
                <div className="h-full rounded-full" style={{ width: `${percent}%`, background: "linear-gradient(90deg,#318BFF,#8B4DFF)" }} />
              </div>
            </Link>
          );
        })}
      </div>

      <ProjectFormSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(id) => {
          setCreateOpen(false);
          toast(t("projects.created"), "success");
          void load();
          if (id) router.push(`/projects/${id}`);
        }}
      />
    </>
  );
}

export function ProjectFormSheet({ open, onClose, onSaved, initial }: { open: boolean; onClose: () => void; onSaved: (id: string | null) => void; initial?: { id: string; name: string; description: string; status: string; deadline: string | null } | null }) {
  const { t, toast } = useApp();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState(initial?.status ?? "PLANNING");
  const [deadline, setDeadline] = useState(initial?.deadline ? initial.deadline.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) {
      toast(t("projects.name"), "error");
      return;
    }
    setBusy(true);
    const result = initial
      ? await api("/api/projects", { method: "POST", body: { action: "update", projectId: initial.id, name, description, status, deadline: deadline || "" } })
      : await api<{ id: string }>("/api/projects", { method: "POST", body: { action: "create", name, description, status, deadline: deadline || "" } });
    setBusy(false);
    if (!result.ok) {
      toast(result.data.error === "name_taken" ? t("projects.nameTaken") : t("common.error"), "error");
      return;
    }
    toast(initial ? t("projects.saved") : t("projects.created"), "success");
    onSaved(initial ? initial.id : (result.data as { id: string }).id);
  };

  return (
    <Sheet open={open} onClose={onClose} title={initial ? t("projects.edit") : t("projects.new")}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="project-name">{t("projects.name")}</label>
          <input id="project-name" className="field" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="project-desc">{t("projects.description")}</label>
          <textarea id="project-desc" className="field" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
        </div>
        <div>
          <label className="label" htmlFor="project-status">{t("projects.status")}</label>
          <select id="project-status" className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
            {Object.entries(STATUS_KEYS).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="project-deadline">{t("projects.deadline")}</label>
          <input id="project-deadline" type="date" className="field" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? <Spinner /> : null} {initial ? t("common.save") : t("projects.new")}
        </button>
      </div>
    </Sheet>
  );
}

type ProjectDetailData = {
  project: {
    id: string;
    name: string;
    description: string;
    status: string;
    deadline: string | null;
    createdAt: string;
    creatorName: string | null;
    members: { id: string; displayName: string; username: string; role: string; title: string | null; avatarUrl: string | null }[];
    tasks: { id: string; title: string; status: string; priority: string; progress: number; deadline: string | null; assignees: { id: string; displayName: string; avatarUrl: string | null }[] }[];
    activity: { id: string; action: string; detail: string | null; createdAt: string; actorName: string | null }[];
    files: { id: string; name: string; kind: string; size: number; taskTitle: string }[];
  };
  permissions: { canManage: boolean };
};

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const { t, toast, locale } = useApp();
  const { open: openViewer } = useViewer();
  const router = useRouter();
  const [data, setData] = useState<ProjectDetailData | null>(null);
  const [error, setError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [people, setPeople] = useState<{ id: string; displayName: string; avatarUrl: string | null }[]>([]);

  const load = useCallback(async () => {
    const result = await api<ProjectDetailData>(`/api/projects?id=${projectId}`);
    if (result.ok) {
      setData(result.data);
      setError(false);
    } else setError(true);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addMember = async (userId: string) => {
    const result = await api("/api/projects", { method: "POST", body: { action: "members", projectId, add: true, userId } });
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    setMemberOpen(false);
    await load();
  };

  if (error) return <div className="screen pt-6"><ErrorState message={t("projects.notFound")} retryLabel={t("common.retry")} onRetry={() => void load()} /></div>;
  if (!data) return <div className="screen flex justify-center pt-10"><Spinner size={22} /></div>;
  const project = data.project;

  return (
    <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
      <div className="flex items-center gap-2">
        <Link href="/projects" className="icon-btn h-9 w-9" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>
        <span className="pill min-h-[26px] cursor-default px-2 text-[10px]">{t(STATUS_KEYS[project.status] ?? "projects.planning")}</span>
        <span className="muted tiny ml-auto">{project.deadline ? formatDateShort(project.deadline) : "—"}</span>
      </div>
      <div className="g-card p-3.5">
        <h1 className="text-[18px] font-bold">{project.name}</h1>
        <p className="muted mt-1 whitespace-pre-wrap text-[12.5px]">{project.description || t("projects.noActivity")}</p>
        <p className="muted tiny mt-1.5">{project.creatorName ?? "—"} · {formatDateShort(project.createdAt)}</p>
      </div>

      <div className="g-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12.5px] font-semibold">{t("projects.members")}</p>
          {data.permissions.canManage ? (
            <button
              type="button"
              className="muted text-[11px]"
              onClick={async () => {
                const result = await api<{ members: typeof people }>("/api/home");
                if (result.ok) setPeople(result.data.members as unknown as typeof people);
                setMemberOpen(true);
              }}
            >
              <UserPlus size={12} className="mr-1 inline" />{t("projects.addMember")}
            </button>
          ) : null}
        </div>
        {project.members.map((member) => (
          <Link key={member.id} href={`/profile/${member.id}`} className="flex items-center gap-2 border-b border-[var(--border)] py-1.5 last:border-b-0">
            <Avatar name={member.displayName} src={member.avatarUrl} size={26} />
            <span className="flex-1 truncate text-[12px]">{member.displayName}</span>
            <span className="muted tiny">{t(`role.${member.role}` as "role.MEMBER")}</span>
          </Link>
        ))}
      </div>

      <div className="g-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12.5px] font-semibold">{t("projects.tasks")}</p>
          {data.permissions.canManage ? (
            <button type="button" className="muted text-[11px]" onClick={() => setTaskOpen(true)}>
              <Plus size={12} className="mr-1 inline" />{t("projects.createTask")}
            </button>
          ) : null}
        </div>
        {project.tasks.length === 0 ? <p className="muted tiny">{t("projects.noTasks")}</p> : null}
        <div className="flex flex-col gap-1.5">
          {project.tasks.map((task) => (
            <TaskCard
              key={task.id}
              locale={locale}
              onOpen={() => router.push(`/tasks/${task.id}`)}
              task={{
                id: task.id,
                title: task.title,
                description: "",
                priority: task.priority,
                status: task.status,
                progress: task.progress,
                deadline: task.deadline,
                createdAt: project.createdAt,
                overdue: Boolean(task.deadline && new Date(task.deadline).getTime() < Date.now() && task.status !== "COMPLETED"),
                sender: { id: "unknown", displayName: project.creatorName ?? "—", username: "", role: "MEMBER", title: null, avatarUrl: null },
                assignees: task.assignees.map((row) => ({ ...row, username: "", role: "MEMBER", status: "PENDING", progress: 0 })),
                project: { id: project.id, name: project.name },
                group: null,
              }}
            />
          ))}
        </div>
      </div>

      <div className="g-card p-3">
        <p className="mb-1.5 text-[12.5px] font-semibold">{t("projects.files")}</p>
        {project.files.length === 0 ? <p className="muted tiny">{t("chat.noFiles")}</p> : <div className="grid grid-cols-3 gap-1.5">
          {project.files.map((file) => (
            <button
              key={file.id}
              type="button"
              onClick={() =>
                openViewer({
                  title: project.name,
                  items: project.files.map((entry) => ({
                    id: entry.id,
                    thumbId: null,
                    kind: entry.kind,
                    name: entry.name,
                    mime: "",
                    size: entry.size,
                    width: null,
                    height: null,
                    duration: null,
                    expired: false,
                    createdAt: project.createdAt,
                    senderName: entry.taskTitle,
                  })) as MediaItem[],
                  index: project.files.findIndex((entry) => entry.id === file.id),
                })
              }
              className="relative aspect-square overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)]"
              aria-label={file.name}
            >
              {file.kind === "image" || file.kind === "video" ? (
                <img src={thumbUrl({ id: file.id, thumbId: null } as MediaItem)} alt="" width={120} height={120} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-1 px-1 text-center">
                  <FileText size={18} />
                  <span className="line-clamp-2 text-[9px]">{file.name}</span>
                  <span className="muted text-[8px]">{formatBytes(file.size)}</span>
                </span>
              )}
            </button>
          ))}
        </div>}
      </div>

      <div className="g-card p-3">
        <p className="mb-1.5 text-[12.5px] font-semibold">{t("projects.activity")}</p>
        {project.activity.length === 0 ? <p className="muted tiny">{t("projects.noActivity")}</p> : null}
        {project.activity.map((entry) => (
          <p key={entry.id} className="muted tiny border-b border-[var(--border)] py-1 last:border-b-0">
            <b>{entry.actorName ?? "—"}</b> · {entry.action}{entry.detail ? ` · ${entry.detail}` : ""} · {formatDateShort(entry.createdAt)}
          </p>
        ))}
      </div>

      {data.permissions.canManage ? (
        <div className="flex gap-1.5">
          <button type="button" className="btn btn-ghost flex-1" onClick={() => setEditOpen(true)}>{t("projects.edit")}</button>
          <button type="button" className="btn btn-danger flex-1" onClick={() => setDeleteOpen(true)}><Trash2 size={14} /> {t("delete.menu")}</button>
        </div>
      ) : null}

      <ProjectFormSheet open={editOpen} onClose={() => setEditOpen(false)} initial={project} onSaved={() => { setEditOpen(false); void load(); }} />
      <TaskFormSheet open={taskOpen} onClose={() => setTaskOpen(false)} projectId={projectId} onCreated={() => { setTaskOpen(false); void load(); }} />

      <Sheet open={memberOpen} onClose={() => setMemberOpen(false)} title={t("projects.addMember")}>
        <div className="flex flex-col gap-1">
          {people.filter((person) => !project.members.some((member) => member.id === person.id)).map((person) => (
            <button key={person.id} type="button" className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-left text-[12px]" onClick={() => void addMember(person.id)}>
              <Avatar name={person.displayName} src={person.avatarUrl} size={22} />
              {person.displayName}
              <Plus size={13} className="ml-auto" />
            </button>
          ))}
        </div>
      </Sheet>

      <PermanentDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        type="project"
        targetId={projectId}
        label={project.name}
        typing
        alsoTasksOption
        onDeleted={() => router.push("/projects")}
      />
    </div>
  );
}
