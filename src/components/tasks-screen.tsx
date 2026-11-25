"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Flame, ListChecks, Plus, Search, Send, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { useViewer } from "./media-viewer-provider";
import { Avatar, EmptyState, ErrorState, ListSkeleton, NameWithTag, ScreenHeader, Sheet, Spinner } from "./ui";
import { PermanentDeleteDialog } from "./permanent-delete";
import { prepareUpload, uploadMedia } from "@/lib/upload-client";
import { formatBytes, thumbUrl, type MediaItem } from "@/lib/media-types";
import { formatDateShort, formatDateTime, formatListTime } from "@/lib/time";
import type { MessageKey } from "@/i18n";
import { WolfMark } from "./wolf-art";

type TaskItem = {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  progress: number;
  deadline: string | null;
  createdAt: string;
  overdue: boolean;
  sender: { id: string; displayName: string; username: string; role: string; title: string | null; avatarUrl: string | null };
  assignees: { id: string; displayName: string; username: string; role: string; avatarUrl: string | null; status: string; progress: number }[];
  project: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
};

type Buckets = Record<string, TaskItem[]> | null;

const PRIORITY_COLOR: Record<string, string> = { HIGH: "#FF3B6B", MEDIUM: "#F59E0B", LOW: "#22C55E" };

function priorityLabel(priority: string, t: (key: MessageKey) => string) {
  return priority === "HIGH" ? t("tasks.high") : priority === "MEDIUM" ? t("tasks.medium") : t("tasks.low");
}

function deadlineText(task: TaskItem, t: (key: MessageKey, vars?: Record<string, string | number>) => string) {
  if (task.status === "COMPLETED") return t("tasks.completedLabel");
  if (!task.deadline) return t("tasks.noDeadline");
  const diff = new Date(task.deadline).getTime() - Date.now();
  if (diff < 0) {
    const days = Math.max(Math.ceil(-diff / 86400000), 1);
    return t("tasks.overdueBy", { days });
  }
  if (diff < 3600000) return t("tasks.dueHours", { hours: Math.max(Math.round(diff / 3600000), 1) });
  const days = Math.ceil(diff / 86400000);
  return t("tasks.giveBefore", { days, count: days });
}

export function TasksScreen({ groupId = null, projectId = null, startCreating = false }: { groupId?: string | null; projectId?: string | null; startCreating?: boolean }) {
  const { t, toast, locale } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<TaskItem[] | null>(null);
  const [buckets, setBuckets] = useState<Buckets>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<"mine" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "deadline">("mine");
  const [scope, setScope] = useState<"mine" | "everyone">("mine");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("filter", filter === "mine" ? "mine" : filter === "deadline" ? "deadline" : "mine");
    if (filter === "PENDING" || filter === "IN_PROGRESS" || filter === "COMPLETED") params.set("status", filter);
    params.set("scope", scope);
    if (query.trim()) params.set("q", query.trim());
    if (groupId) params.set("groupId", groupId);
    if (projectId) params.set("projectId", projectId);
    const result = await api<{ items: TaskItem[]; buckets: Buckets; canCreate: boolean }>(`/api/tasks?${params.toString()}`);
    if (result.ok) {
      setItems(result.data.items);
      setBuckets(result.data.buckets);
      setCanCreate(result.data.canCreate);
      setError(false);
    } else setError(true);
  }, [filter, scope, query, groupId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (startCreating && canCreate) setCreateOpen(true);
  }, [startCreating, canCreate]);

  return (
    <>
      {!groupId && !projectId ? (
        <ScreenHeader
          title={t("tasks.title")}
          art="/brand/header-tasks.webp"
          right={
            <button type="button" className="icon-btn h-9 w-9" aria-label={t("common.search")} onClick={() => searchRef.current?.focus()}>
              <Search size={17} />
            </button>
          }
        />
      ) : null}
      <div className={groupId || projectId ? "flex flex-col gap-2 p-2" : "screen flex flex-col gap-2"} style={{ paddingTop: groupId || projectId ? 4 : 10 }}>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-2)]" />
          <input
            ref={searchRef}
            className="field pl-9 pr-9"
            placeholder={t("tasks.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("common.search")}
          />
          {query ? (
            <button type="button" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center" aria-label={t("common.close")} onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {([
            ["mine", t("tasks.myTasks")],
            ["PENDING", t("tasks.pending")],
            ["IN_PROGRESS", t("tasks.inProgress")],
            ["COMPLETED", t("tasks.completed")],
            ["deadline", t("tasks.deadline")],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={`pill min-h-[32px] px-2.5 text-[11.5px] ${filter === value ? "pill-active" : ""}`} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>

        {canCreate ? (
          <div className="flex items-center gap-1.5">
            <span className="section-label mr-auto">{filter === "deadline" ? t("tasks.byDeadline") : t("tasks.title")}</span>
            <button type="button" className={`pill min-h-[28px] px-2 text-[10.5px] ${scope === "mine" ? "pill-active" : ""}`} onClick={() => setScope("mine")}>{t("tasks.mine")}</button>
            <button type="button" className={`pill min-h-[28px] px-2 text-[10.5px] ${scope === "everyone" ? "pill-active" : ""}`} onClick={() => setScope("everyone")}>{t("tasks.everyone")}</button>
          </div>
        ) : null}

        {error && !items ? <ErrorState message={t("common.networkError")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {!items && !error ? <ListSkeleton rows={3} /> : null}
        {items && items.length === 0 ? (
          <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]">
              <WolfMark size={220} />
            </div>
            <EmptyState
              icon={<ListChecks size={22} />}
              title={t("tasks.emptyTitle")}
              body={t("tasks.emptyBody")}
              action={canCreate ? <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> {t("tasks.new")}</button> : undefined}
            />
          </div>
        ) : null}

        {buckets
          ? (["overdue", "today", "tomorrow", "week", "later", "none"] as const).map((key) =>
              buckets[key]?.length ? (
                <section key={key} className="flex flex-col gap-1.5">
                  <p className="section-label">{t(`tasks.bucket.${key}` as MessageKey)}</p>
                  {buckets[key].map((task) => <TaskCard key={task.id} task={task} locale={locale} onOpen={() => router.push(`/tasks/${task.id}`)} />)}
                </section>
              ) : null,
            )
          : items?.map((task) => <TaskCard key={task.id} task={task} locale={locale} onOpen={() => router.push(`/tasks/${task.id}`)} />)}

        {groupItemsNote(groupId, t)}
      </div>

      {canCreate && !groupId && !projectId ? (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="fixed bottom-[calc(104px+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full text-white sm:left-auto sm:right-[calc(50%-230px)] sm:translate-x-0"
          style={{ background: "linear-gradient(140deg,#318BFF,#8B4DFF)" }}
          aria-label={t("tasks.new")}
        >
          <Plus size={22} />
        </button>
      ) : null}

      <TaskFormSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        groupId={groupId}
        projectId={projectId}
        onCreated={(id) => {
          setCreateOpen(false);
          toast(t("tasks.created"), "success");
          void load();
          router.push(`/tasks/${id}`);
        }}
      />

      {detailId ? <TaskDetailSheet taskId={detailId} onClose={() => { setDetailId(null); void load(); }} /> : null}
    </>
  );
}

function groupItemsNote(groupId: string | null, t: (key: MessageKey) => string) {
  if (groupId) return <p className="muted tiny text-center">{t("tasks.groupNote")}</p>;
  return null;
}

export function TaskCard({ task, locale, onOpen }: { task: TaskItem; locale: "en" | "bn"; onOpen: () => void }) {
  const { t } = useApp();
  const color = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.MEDIUM;
  return (
    <button type="button" onClick={onOpen} className="g-card streak w-full p-2.5 text-left">
      <div className="flex items-start justify-between gap-2">
        <span className={`flex items-center gap-1 text-[11px] ${task.overdue ? "font-semibold" : "text-[var(--text-2)]"}`} style={task.overdue ? { color: "var(--danger)" } : undefined}>
          {task.status === "COMPLETED" ? <CheckCircle2 size={12} /> : <CalendarDays size={12} />}
          {deadlineText(task, t)}
        </span>
        <span className="flex flex-none items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase" style={{ border: `1px solid ${color}`, color }}>
          {task.priority === "HIGH" ? <Flame size={10} /> : null}
          {priorityLabel(task.priority, t)}
        </span>
      </div>
      <p className="mt-1 text-[15px] font-bold leading-snug">{task.title}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Send size={12} className="text-[var(--text-2)]" />
        <span className="muted text-[11px]">{t("tasks.send")} -</span>
        <Avatar name={task.sender.displayName} src={task.sender.avatarUrl} size={20} />
        <span className="truncate text-[12px] font-semibold">{task.sender.displayName}</span>
        <NameWithTag name="" role={task.sender.role} title={task.sender.title} size={10} />
        <ChevronRight size={14} className="ml-auto text-[var(--text-2)]" />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="muted text-[11px]">{t("tasks.lastSend")} - ({task.deadline ? formatDateShort(task.deadline) : "—"})</span>
        <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ background: `${color}22`, color }}>{priorityLabel(task.priority, t)}</span>
      </div>
      {task.group || task.project ? (
        <p className="muted tiny mt-1 truncate">{task.group ? `#${task.group.name}` : ""}{task.group && task.project ? " · " : ""}{task.project ? task.project.name : ""}</p>
      ) : null}
    </button>
  );
}

export function TaskFormSheet({
  open,
  onClose,
  onCreated,
  groupId = null,
  projectId = null,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  groupId?: string | null;
  projectId?: string | null;
  initial?: TaskItem | null;
}) {
  const { t, toast } = useApp();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "MEDIUM");
  const [deadline, setDeadline] = useState(initial?.deadline ? initial.deadline.slice(0, 16) : "");
  const [assignees, setAssignees] = useState<string[]>(initial?.assignees.map((row) => row.id) ?? []);
  const [project, setProject] = useState(initial?.project?.id ?? projectId ?? "");
  const [people, setPeople] = useState<{ id: string; displayName: string; username: string; avatarUrl: string | null; role: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api<{ members: typeof people }>("/api/home").then((result) => {
      if (result.ok) setPeople(result.data.members as unknown as typeof people);
    });
    void api<{ items: { id: string; name: string }[] }>("/api/projects").then((result) => {
      if (result.ok) setProjects(result.data.items);
    });
  }, [open]);

  const submit = async () => {
    if (title.trim().length < 3) {
      toast(t("tasks.titleRequired"), "error");
      return;
    }
    if (!assignees.length) {
      toast(t("tasks.assigneeRequired"), "error");
      return;
    }
    setBusy(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      priority,
      deadline: deadline ? new Date(deadline).toISOString() : "",
      assigneeIds: assignees,
      projectId: project,
      groupId: groupId ?? "",
    };
    const result = initial
      ? await api<{ id: string }>("/api/tasks", { method: "POST", body: { action: "update", taskId: initial.id, ...payload } })
      : await api<{ id: string }>("/api/tasks", { method: "POST", body: { action: "create", ...payload } });
    setBusy(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    onCreated(initial ? initial.id : result.data.id);
  };

  const filtered = people.filter((person) => person.displayName.toLowerCase().includes(search.toLowerCase()) || person.username.includes(search.toLowerCase()));

  return (
    <Sheet open={open} onClose={onClose} title={initial ? t("tasks.edit") : t("tasks.new")}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="task-title">{t("tasks.titleField")}</label>
          <input id="task-title" className="field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} />
        </div>
        <div>
          <label className="label" htmlFor="task-desc">{t("tasks.description")}</label>
          <textarea id="task-desc" className="field" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
        </div>
        <div>
          <span className="label">{t("tasks.priority")}</span>
          <div className="flex gap-1.5">
            {["HIGH", "MEDIUM", "LOW"].map((value) => (
              <button key={value} type="button" className={`pill flex-1 text-[12px] ${priority === value ? "pill-active" : ""}`} onClick={() => setPriority(value)}>
                {priorityLabel(value, t)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="task-deadline">{t("tasks.deadlineField")}</label>
          <input id="task-deadline" type="datetime-local" className="field" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
          <p className="muted tiny mt-1">{t("tasks.timezone")}</p>
        </div>
        {!projectId ? (
          <div>
            <label className="label" htmlFor="task-project">{t("tasks.project")}</label>
            <select id="task-project" className="field" value={project} onChange={(event) => setProject(event.target.value)}>
              <option value="">{t("tasks.noProject")}</option>
              {projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </div>
        ) : null}
        <div>
          <span className="label">{t("tasks.assignees")}</span>
          <input className="field mb-1.5" placeholder={t("tasks.memberSearch")} value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="hide-scroll flex max-h-40 flex-col gap-1 overflow-y-auto">
            {filtered.map((person) => (
              <label key={person.id} className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--blue)]"
                  checked={assignees.includes(person.id)}
                  onChange={(event) => setAssignees(event.target.checked ? [...assignees, person.id] : assignees.filter((id) => id !== person.id))}
                />
                <Avatar name={person.displayName} src={person.avatarUrl} size={20} />
                {person.displayName}
              </label>
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? <Spinner /> : null} {initial ? t("common.save") : t("tasks.new")}
        </button>
      </div>
    </Sheet>
  );
}

export function TaskDetailScreen({ taskId }: { taskId: string }) {
  const { t, toast, locale } = useApp();
  const { open: openViewer } = useViewer();
  const router = useRouter();
  const [data, setData] = useState<{
    task: TaskItem & { comments: { id: string; body: string; deleted: boolean; createdAt: string; mine: boolean; media: MediaItem | null; author: { id: string; displayName: string; role: string; avatarUrl: string | null } }[]; activity: { id: string; action: string; detail: string | null; createdAt: string; actorName: string | null }[]; completedAt: string | null };
    permissions: { canManage: boolean; isAssignee: boolean; canChangeStatus: boolean };
  } | null>(null);
  const [error, setError] = useState(false);
  const [comment, setComment] = useState("");
  const [attachment, setAttachment] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [progressDraft, setProgressDraft] = useState<number | null>(null);

  const load = useCallback(async () => {
    const result = await api<NonNullable<typeof data>>(`/api/tasks?id=${taskId}`);
    if (result.ok) {
      setData(result.data);
      setError(false);
    } else setError(true);
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (payload: Record<string, unknown>, success?: string) => {
    setBusy(true);
    const result = await api("/api/tasks", { method: "POST", body: { ...payload, taskId } });
    setBusy(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return false;
    }
    if (success) toast(success, "success");
    await load();
    return true;
  };

  if (error) return <div className="screen pt-6"><ErrorState message={t("tasks.loadFailed")} retryLabel={t("common.retry")} onRetry={() => void load()} /></div>;
  if (!data) return <div className="screen flex justify-center pt-10"><Spinner size={22} /></div>;
  const task = data.task;

  return (
    <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
      <div className="flex items-center gap-2">
        <Link href="/tasks" className="icon-btn h-9 w-9" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>
        <span className="pill cursor-default min-h-[30px] px-2.5 text-[11px]" style={{ color: PRIORITY_COLOR[task.priority], borderColor: PRIORITY_COLOR[task.priority] }}>
          {priorityLabel(task.priority, t)}
        </span>
        <span className="muted tiny ml-auto">{deadlineText(task, t)}</span>
      </div>

      <div className="g-card p-3.5">
        <h1 className="text-[18px] font-bold leading-tight">{task.title}</h1>
        {task.description ? <p className="muted mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">{task.description}</p> : null}
        <div className="mt-2 flex items-center gap-1.5">
          <Avatar name={task.sender.displayName} src={task.sender.avatarUrl} size={22} />
          <span className="muted text-[11px]">{t("tasks.send")} -</span>
          <span className="text-[12px] font-semibold">{task.sender.displayName}</span>
          <NameWithTag name="" role={task.sender.role} title={task.sender.title} size={10} />
        </div>
        <p className="muted tiny mt-1">{t("tasks.lastSend")}: {task.deadline ? formatDateTime(task.deadline, locale) : t("tasks.noDeadline")}</p>
        {task.group || task.project ? (
          <p className="mt-1 flex flex-wrap gap-2 text-[11px]">
            {task.group ? <Link href={`/groups/${task.group.id}`} className="text-[var(--electric)] underline">#{task.group.name}</Link> : null}
            {task.project ? <Link href={`/projects/${task.project.id}`} className="text-[var(--electric)] underline">{task.project.name}</Link> : null}
          </p>
        ) : null}
      </div>

      <div className="g-card p-3">
        <p className="mb-2 text-[12.5px] font-semibold">{t("tasks.progress")}</p>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progressDraft ?? task.progress}
            disabled={!data.permissions.isAssignee}
            aria-label={t("tasks.progress")}
            onChange={(event) => setProgressDraft(Number(event.target.value))}
            onPointerUp={() => {
              if (progressDraft !== null && progressDraft !== task.progress) {
                void act({ action: "progress", progress: progressDraft }).then(() => setProgressDraft(null));
              }
            }}
            onKeyUp={() => {
              if (progressDraft !== null && progressDraft !== task.progress) {
                void act({ action: "progress", progress: progressDraft }).then(() => setProgressDraft(null));
              }
            }}
            className="flex-1 accent-[var(--blue)]"
          />
          <span className="text-[12px] font-semibold">{progressDraft ?? task.progress}%</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["PENDING", "IN_PROGRESS", "COMPLETED"] as const).map((status) => (
            <button
              key={status}
              type="button"
              disabled={!data.permissions.canChangeStatus || busy}
              className={`pill min-h-[30px] px-2.5 text-[11px] ${task.status === status ? "pill-active" : ""}`}
              onClick={() => void act({ action: "status", status }, status === "COMPLETED" ? t("tasks.completedToast") : t("tasks.statusToast"))}
            >
              {status === "PENDING" ? t("tasks.pending") : status === "IN_PROGRESS" ? t("tasks.inProgress") : t("tasks.completed")}
            </button>
          ))}
        </div>
      </div>

      <div className="g-card p-3">
        <p className="mb-2 text-[12.5px] font-semibold">{t("tasks.assignees")}</p>
        {task.assignees.map((assignee) => (
          <Link key={assignee.id} href={`/profile/${assignee.id}`} className="flex items-center gap-2 border-b border-[var(--border)] py-1.5 last:border-b-0">
            <Avatar name={assignee.displayName} src={assignee.avatarUrl} size={26} />
            <span className="flex-1 truncate text-[12px]">{assignee.displayName}</span>
            <span className="muted tiny">{assignee.progress}%</span>
          </Link>
        ))}
      </div>

      <div className="g-card p-3">
        <p className="mb-2 text-[12.5px] font-semibold">{t("tasks.comments")}</p>
        {task.comments.length === 0 ? <p className="muted tiny">{t("tasks.noComments")}</p> : null}
        {task.comments.map((entry) => (
          <div key={entry.id} className="mb-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2">
            <div className="flex items-center gap-1.5">
              <Avatar name={entry.author.displayName} src={entry.author.avatarUrl} size={20} />
              <span className="text-[11.5px] font-semibold">{entry.author.displayName}</span>
              <span className="muted tiny ml-auto">{formatListTime(entry.createdAt, locale, { yesterday: t("common.yesterday") })}</span>
            </div>
            <p className={`mt-1 text-[12px] ${entry.deleted ? "italic opacity-70" : ""}`}>{entry.deleted ? t("chat.deletedMessage") : entry.body}</p>
            {entry.media ? (
              <button
                type="button"
                onClick={() => openViewer({ title: task.title, items: [entry.media!], index: 0 })}
                className="mt-1 block w-full overflow-hidden rounded-[8px] border border-[var(--border)]"
              >
                {entry.media.kind === "image" || entry.media.kind === "video" ? (
                  <img src={thumbUrl(entry.media)} alt={entry.media.name} width={320} height={180} loading="lazy" className="max-h-40 w-full object-cover" />
                ) : (
                  <span className="flex items-center gap-1.5 p-2 text-[11px]">{entry.media.kind} · {entry.media.name} · {formatBytes(entry.media.size)}</span>
                )}
              </button>
            ) : null}
            {entry.mine && !entry.deleted ? (
              <div className="mt-1 flex gap-2 text-[10px]">
                <button type="button" className="muted underline" onClick={() => void act({ action: "delete-comment", commentId: entry.id })}>{t("common.delete")}</button>
              </div>
            ) : null}
          </div>
        ))}
        <textarea className="field mb-1.5" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("tasks.commentPlaceholder")} maxLength={1000} />
        <div className="flex items-center gap-1.5">
          <label className="btn btn-ghost min-h-[38px] flex-1 cursor-pointer justify-start text-[11.5px]">
            {attachment ? attachment.name : t("tasks.attach")}
            <input
              type="file"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  const prepared = await prepareUpload(file);
                  const uploaded = await uploadMedia(file, file.name, prepared);
                  setAttachment(uploaded);
                } catch {
                  toast(t("chat.uploadFailed"), "error");
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary min-h-[38px] px-3 text-[12px]"
            disabled={busy || (!comment.trim() && !attachment)}
            onClick={async () => {
              const ok = await act({ action: "comment", body: comment.trim(), mediaId: attachment?.id ?? "" });
              if (ok) {
                setComment("");
                setAttachment(null);
              }
            }}
          >
            {busy ? <Spinner /> : <Send size={14} />}
          </button>
        </div>
      </div>

      <div className="g-card p-3">
        <p className="mb-1.5 text-[12.5px] font-semibold">{t("tasks.activity")}</p>
        {task.activity.map((entry) => (
          <p key={entry.id} className="muted tiny border-b border-[var(--border)] py-1 last:border-b-0">
            <b>{entry.actorName ?? "—"}</b> · {entry.action}{entry.detail ? ` · ${entry.detail}` : ""} · {formatDateShort(entry.createdAt)}
          </p>
        ))}
        {task.activity.length === 0 ? <p className="muted tiny">{t("tasks.noActivity")}</p> : null}
      </div>

      {data.permissions.canManage ? (
        <div className="flex gap-1.5">
          <button type="button" className="btn btn-ghost flex-1" onClick={() => setEditOpen(true)}>{t("common.edit")}</button>
          <button type="button" className="btn btn-danger flex-1" onClick={() => setDeleteOpen(true)}><Trash2 size={14} /> {t("delete.menu")}</button>
        </div>
      ) : null}

      <TaskFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={task}
        onCreated={() => {
          setEditOpen(false);
          void load();
        }}
      />

      <PermanentDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        type="task"
        targetId={taskId}
        label={task.title}
        typing
        onDeleted={() => router.push("/tasks")}
      />
    </div>
  );
}

export function TaskDetailSheet({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { t } = useApp();
  return (
    <Sheet open onClose={onClose} title={t("tasks.detail")}>
      <Link href={`/tasks/${taskId}`} className="btn btn-primary w-full" onClick={onClose}>
        {t("tasks.open")}
      </Link>
    </Sheet>
  );
}

