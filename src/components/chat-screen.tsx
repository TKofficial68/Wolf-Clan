"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  Download,
  FileText,
  Hourglass,
  Link2,
  Mic,
  MoreVertical,
  Paperclip,
  Pin,
  Search,
  Send,
  Smile,
  Square,
  Users,
  X,
  Flag,
} from "lucide-react";
import type { ChatMessage, ChatPayload } from "@/lib/chat-types";
import { REACTIONS } from "@/lib/chat-types";
import { formatBytes, formatDuration, mediaUrl, thumbUrl } from "@/lib/media-types";
import { formatListTime } from "@/lib/time";
import type { MediaItem } from "@/lib/media-types";
import { useApp } from "./providers";
import { useViewer } from "./media-viewer-provider";
import { Avatar, ConfirmDialog, EmptyState, ErrorState, NameWithTag, Sheet, Spinner } from "./ui";
import { ConnectionBar } from "./connection-bar";
import { DeleteMenuItem } from "./permanent-delete";
import { ReportSheet } from "./reports-screen";
import { api, errorKey } from "@/lib/client";
import { offline, scopeKey, type OutboxItem } from "@/lib/offline";
import { MAX_UPLOAD_MB, prepareUpload, uploadMedia } from "@/lib/upload-client";
import type { MessageKey } from "@/i18n";

type Row =
  | { key: string; type: "date"; label: string }
  | { key: string; type: "unread" }
  | { key: string; type: "message"; message: ChatMessage };

function statusIcon(status: string) {
  if (status === "read") return <CheckCheck size={13} style={{ color: "#4FC3FF" }} aria-label="read" />;
  if (status === "delivered") return <CheckCheck size={13} style={{ color: "#9fb3cd" }} aria-label="delivered" />;
  if (status === "sent") return <Check size={13} style={{ color: "#9fb3cd" }} aria-label="sent" />;
  if (status === "queued") return <Hourglass size={13} aria-label="queued" />;
  if (status === "failed") return <AlertTriangle size={13} style={{ color: "#ff6b81" }} aria-label="failed" />;
  return <Clock3 size={12} aria-label="sending" />;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function RichText({ text, members }: { text: string; members: { username: string; displayName: string }[] }) {
  const tokens = text.split(/(@[a-z0-9._]{3,20}|https?:\/\/[^\s]+)/gi);
  return (
    <>
      {tokens.map((token, index) => {
        if (URL_PATTERN.test(token)) {
          return (
            <a key={index} href={token} target="_blank" rel="noreferrer noopener" className="underline" style={{ color: "#8fd8ff" }}>
              {token}
            </a>
          );
        }
        if (token.startsWith("@") && members.some((member) => `@${member.username}` === token.toLowerCase())) {
          return (
            <span key={index} className="rounded px-0.5 font-semibold" style={{ background: "rgba(79,195,255,0.22)", color: "#8fd8ff" }}>
              {token}
            </span>
          );
        }
        return <span key={index}>{token}</span>;
      })}
    </>
  );
}

export function ChatScreen({
  kind,
  id,
  embedded = false,
  height = "calc(100dvh - 92px - env(safe-area-inset-bottom))",
  onHeaderMeta,
}: {
  kind: "dm" | "group";
  id: string;
  embedded?: boolean;
  height?: string;
  onHeaderMeta?: (payload: ChatPayload) => void;
}) {
  const { t, locale, toast, prefs } = useApp();
  const { open: openViewer } = useViewer();
  const router = useRouter();
  const [payload, setPayload] = useState<ChatPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<ChatMessage[]>([]);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [readersOpen, setReadersOpen] = useState<ChatMessage | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ message: ChatMessage; mode: "me" | "all" } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ seconds: number; blob: Blob | null; url: string | null } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStart = useRef<number>(0);
  const cancelRecord = useRef(false);
  const typingSent = useRef(0);
  const initialised = useRef(false);
  const key = scopeKey(kind, id);

  const loadPayload = useCallback(
    async (options: { quiet?: boolean; before?: string } = {}) => {
      const query = new URLSearchParams({ kind, id });
      if (options.before) query.set("before", options.before);
      const result = await api<ChatPayload>(`/api/chat?${query.toString()}`);
      if (!result.ok) {
        if (!options.quiet) setError(result.data.error ?? "chat_load_failed");
        return null;
      }
      const next = result.data;
      if (options.before) {
        setPayload((prev) =>
          prev
            ? { ...prev, messages: [...next.messages, ...prev.messages], hasMore: next.hasMore, pinned: next.pinned, typing: next.typing }
            : next,
        );
      } else {
        setPayload(next);
        setHasMore(next.hasMore);
        onHeaderMeta?.(next);
        void offline.cacheMessages(key, next.messages);
      }
      setError(null);
      setLoading(false);
      return next;
    },
    [id, kind, key, onHeaderMeta],
  );

  useEffect(() => {
    setLoading(true);
    setPayload(null);
    initialised.current = false;
    void (async () => {
      const result = await loadPayload();
      if (!result) {
        const cached = await offline.getCachedMessages(key);
        if (cached?.length) {
          setPayload(null);
          setOptimistic(cached.filter(() => false));
          setLoading(false);
        }
      }
      const draft = await offline.getDraft(key);
      if (draft) setText(draft);
    })();
  }, [key, loadPayload]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadPayload({ quiet: true });
    }, 4000);
    const onFocus = () => void loadPayload({ quiet: true });
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadPayload]);

  const messages = useMemo(() => {
    const base = payload?.messages ?? [];
    const serverIds = new Set(base.map((message) => message.clientMessageId).filter(Boolean));
    const extra = optimistic.filter((message) => !message.clientMessageId || !serverIds.has(message.clientMessageId));
    return [...base, ...extra];
  }, [payload, optimistic]);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    let lastDate = "";
    let unreadPlaced = false;
    messages.forEach((message, index) => {
      const date = new Date(message.createdAt);
      const dateKey = date.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
      if (dateKey !== lastDate) {
        lastDate = dateKey;
        list.push({ key: `date-${dateKey}-${index}`, type: "date", label: formatListTime(date, locale, { yesterday: t("common.yesterday") }) });
      }
      if (!unreadPlaced && payload?.firstUnreadId && message.id === payload.firstUnreadId && !message.mine) {
        unreadPlaced = true;
        list.push({ key: "unread-divider", type: "unread" });
      }
      list.push({ key: message.id || `pending-${index}`, type: "message", message });
    });
    return list;
  }, [messages, locale, payload?.firstUnreadId, t]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 8,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  const scrollToBottom = useCallback(
    (smooth = false) => {
      if (!rows.length) return;
      virtualizer.scrollToIndex(rows.length - 1, { align: "end", behavior: smooth ? "smooth" : "auto" });
      setNewCount(0);
      setAtBottom(true);
    },
    [rows.length, virtualizer],
  );

  useEffect(() => {
    if (!payload || initialised.current || !rows.length) return;
    initialised.current = true;
    const unreadIndex = rows.findIndex((row) => row.type === "unread");
    if (unreadIndex > 0) virtualizer.scrollToIndex(unreadIndex, { align: "start" });
    else virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
  }, [payload, rows, virtualizer]);

  useEffect(() => {
    if (!payload) return;
    const timeout = setTimeout(() => {
      if (document.visibilityState === "visible") {
        void api("/api/chat", { method: "POST", body: { action: "read", kind, scopeId: id } });
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [payload, kind, id]);

  useEffect(() => {
    return () => {
      Object.values(localPreviews).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scopeMembers = payload?.members ?? [];
  const peer = payload?.peer ?? null;
  const myId = payload?.members.find((member) => member.groupRole !== undefined && member.id)?.id;

  const openMedia = (message: ChatMessage, all: ChatMessage[]) => {
    const mediaMessages = all.filter((entry) => entry.media && !entry.deleted);
    const items = mediaMessages.map((entry) => entry.media as MediaItem);
    const index = mediaMessages.findIndex((entry) => entry.id === message.id);
    openViewer({
      title: kind === "group" ? (payload?.group?.name ?? t("groups.title")) : (peer?.displayName ?? t("chat.search")),
      items,
      index: Math.max(index, 0),
      actions: ["reply", "react", "delete"],
      onReply: () => setReplyTo(message),
      onReact: (emoji) => void react(message, emoji),
      onDelete: () => requestDelete(message),
    });
  };

  const refresh = async () => {
    await loadPayload({ quiet: true });
  };

  const sendMessage = async (input: {
    body: string;
    messageType: string;
    mediaId?: string | null;
    media?: MediaItem | null;
    blob?: Blob | null;
    fileName?: string;
    clientMessageId?: string;
    replyId?: string | null;
  }) => {
    const clientMessageId = input.clientMessageId ?? crypto.randomUUID();
    const optimisticMessage: ChatMessage = {
      id: `local-${clientMessageId}`,
      clientMessageId,
      kind: input.messageType,
      body: input.body || null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deleted: false,
      mine: true,
      status: navigator.onLine ? "sending" : "queued",
      sender: {
        id: "me",
        displayName: "You",
        username: "me",
        role: "MEMBER",
        title: null,
        avatarUrl: null,
      },
      media: input.media ?? null,
      replyTo: input.replyId && replyTo ? { id: replyTo.id, senderName: replyTo.sender.displayName, preview: replyTo.body ?? `[${replyTo.kind}]`, kind: replyTo.kind } : null,
      reactions: [],
      pinned: false,
      readCount: 0,
      readBy: [],
    };
    setOptimistic((prev) => [...prev, optimisticMessage]);
    setReplyTo(null);
    setEditing(null);

    const queued: OutboxItem = {
      id: clientMessageId,
      clientMessageId,
      scopeKind: kind,
      scopeId: id,
      body: input.body,
      messageType: input.messageType,
      replyToId: input.replyId ?? null,
      mediaId: input.mediaId ?? null,
      blob: input.blob ?? null,
      mediaName: input.fileName ?? null,
      mediaMime: input.blob?.type ?? null,
      mediaKind: input.messageType,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      await offline.queueMessage(queued);
      setOptimistic((prev) => prev.map((message) => (message.id === optimisticMessage.id ? { ...message, status: "queued" } : message)));
      setPendingCount((count) => count + 1);
      return;
    }

    const result = await api<{ id: string }>("/api/chat", {
      method: "POST",
      body: {
        action: "send",
        kind,
        scopeId: id,
        body: input.body,
        messageType: input.messageType,
        mediaId: input.mediaId ?? null,
        clientMessageId,
        replyToId: input.replyId ?? null,
      },
    });
    if (!result.ok) {
      await offline.queueMessage(queued);
      setOptimistic((prev) => prev.map((message) => (message.id === optimisticMessage.id ? { ...message, status: "queued" } : message)));
      setPendingCount((count) => count + 1);
      return;
    }
    await refresh();
  };

  const syncOutbox = useCallback(async () => {
    if (!navigator.onLine) return;
    const items = await offline.listOutbox(key);
    if (!items.length) {
      setPendingCount(0);
      setOptimistic((prev) => prev.filter((message) => message.status !== "queued"));
      return;
    }
    setPendingCount(items.length);
    for (const item of items) {
      if (item.attempts >= 5) {
        setOptimistic((prev) => prev.map((message) => (message.clientMessageId === item.clientMessageId ? { ...message, status: "failed" } : message)));
        continue;
      }
      let mediaId = item.mediaId;
      if (!mediaId && item.blob && item.mediaName) {
        try {
          const file = new File([item.blob], item.mediaName, { type: item.mediaMime ?? item.blob.type });
          const prepared = await prepareUpload(file, item.mediaKind === "voice");
          const uploaded = await uploadMedia(file, item.mediaName, prepared);
          mediaId = uploaded.id;
        } catch {
          await offline.queueMessage({ ...item, attempts: item.attempts + 1 });
          continue;
        }
      }
      const result = await api("/api/chat", {
        method: "POST",
        body: {
          action: "send",
          kind: item.scopeKind,
          scopeId: item.scopeId,
          body: item.body,
          messageType: item.mediaName || !item.mediaId ? (mediaId ? item.mediaKind : "text") : "text",
          mediaId,
          clientMessageId: item.clientMessageId,
          replyToId: item.replyToId,
        },
      });
      if (result.ok) {
        await offline.removeMessage(item.id);
        setOptimistic((prev) => prev.filter((message) => message.clientMessageId !== item.clientMessageId));
      } else {
        await offline.queueMessage({ ...item, attempts: item.attempts + 1 });
        if (item.attempts + 1 >= 5) {
          setOptimistic((prev) => prev.map((message) => (message.clientMessageId === item.clientMessageId ? { ...message, status: "failed" } : message)));
        }
      }
    }
    setPendingCount(0);
    await refresh();
  }, [key, refresh]);

  useEffect(() => {
    const interval = setInterval(() => void syncOutbox(), 12000);
    void syncOutbox();
    const onOnline = () => void syncOutbox();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, [syncOutbox]);

  const handleFiles = async (fileList: FileList | File[], voice = false) => {
    const files = Array.from(fileList).slice(0, 5);
    setAttachOpen(false);
    for (const file of files) {
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        toast(t("chat.fileTooLarge", { mb: MAX_UPLOAD_MB }), "error");
        continue;
      }
      const prepared = await prepareUpload(file, voice);
      const tempMedia: MediaItem = {
        id: `local-${file.name}-${Date.now()}`,
        thumbId: null,
        kind: prepared.kind,
        name: file.name,
        mime: file.type,
        size: file.size,
        width: prepared.width,
        height: prepared.height,
        duration: prepared.duration,
        expired: false,
        createdAt: new Date().toISOString(),
      };
      if (prepared.kind === "image" || prepared.kind === "video") {
        const previewUrl = URL.createObjectURL(file);
        setLocalPreviews((prev) => ({ ...prev, [tempMedia.id]: previewUrl }));
      }
      const clientMessageId = crypto.randomUUID();
      if (!navigator.onLine) {
        await offline.queueMessage({
          id: clientMessageId,
          clientMessageId,
          scopeKind: kind,
          scopeId: id,
          body: "",
          messageType: prepared.kind,
          replyToId: replyTo?.id ?? null,
          mediaId: null,
          blob: file,
          mediaName: file.name,
          mediaMime: file.type,
          mediaKind: prepared.kind,
          attempts: 0,
          createdAt: new Date().toISOString(),
        });
        await sendMessage({ body: "", messageType: prepared.kind, media: tempMedia, blob: file, fileName: file.name, clientMessageId });
        setPendingCount((count) => count + 1);
        continue;
      }
      try {
        const uploaded = await uploadMedia(file, file.name, prepared);
        await sendMessage({
          body: "",
          messageType: prepared.kind,
          mediaId: uploaded.id,
          media: uploaded,
          clientMessageId,
          replyId: replyTo?.id ?? null,
        });
      } catch {
        toast(t("chat.uploadFailed"), "error");
      }
    }
  };

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast(t("chat.voiceUnsupported"), "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelRecord.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordTimer.current) clearInterval(recordTimer.current);
        if (cancelRecord.current) {
          setRecording(null);
          return;
        }
        const blob = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
        setRecording({ seconds: Math.round((Date.now() - recordStart.current) / 1000), blob, url: URL.createObjectURL(blob) });
      };
      recorder.start();
      mediaRecorder.current = recorder;
      recordStart.current = Date.now();
      setRecording({ seconds: 0, blob: null, url: null });
      recordTimer.current = setInterval(() => {
        const seconds = Math.round((Date.now() - recordStart.current) / 1000);
        setRecording((prev) => (prev ? { ...prev, seconds } : prev));
        if (seconds >= 300) recorder.stop();
      }, 500);
    } catch {
      toast(t("chat.voiceDenied"), "error");
    }
  };

  const stopRecording = (cancel = false) => {
    cancelRecord.current = cancel;
    mediaRecorder.current?.stop();
  };

  const sendVoice = async () => {
    if (!recording?.blob) return;
    const file = new File([recording.blob], `voice-${Date.now()}.webm`, { type: recording.blob.type || "audio/webm" });
    setRecording(null);
    await handleFiles([file], true);
  };

  const react = async (message: ChatMessage, emoji: string) => {
    setActionMessage(null);
    setOptimistic((prev) =>
      prev.map((entry) => {
        if (entry.id !== message.id) return entry;
        const existing = entry.reactions.find((reaction) => reaction.emoji === emoji);
        const reactions = existing
          ? entry.reactions.map((reaction) => (reaction.emoji === emoji ? { ...reaction, count: reaction.count - 1, mine: false } : reaction)).filter((reaction) => reaction.count > 0)
          : [...entry.reactions, { emoji, count: 1, mine: true, names: [] }];
        return { ...entry, reactions };
      }),
    );
    const result = await api("/api/chat", { method: "POST", body: { action: "react", kind, scopeId: id, messageId: message.id, reaction: emoji } });
    if (!result.ok) toast(t("common.error"), "error");
    await refresh();
  };

  const submitEdit = async () => {
    if (!editing) return;
    if (!text.trim()) return;
    const result = await api("/api/chat", { method: "POST", body: { action: "edit", kind, scopeId: id, messageId: editing.id, body: text } });
    setEditing(null);
    setText("");
    void offline.clearDraft(key);
    if (!result.ok) {
      toast(t(errorKey(result.data.error, "common.error") as MessageKey), "error");
      return;
    }
    await refresh();
  };

  const requestDelete = (message: ChatMessage) => {
    setActionMessage(null);
    const canDeleteAll = message.mine || (kind === "group" && payload?.canModerate);
    if (!canDeleteAll) {
      setDeleteConfirm({ message, mode: "me" });
      return;
    }
    setDeleteConfirm({ message, mode: "all" });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { message, mode } = deleteConfirm;
    setDeleteConfirm(null);
    const result = await api("/api/chat", { method: "POST", body: { action: "delete", kind, scopeId: id, messageId: message.id, mode } });
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    setOptimistic((prev) => prev.filter((entry) => entry.id !== message.id));
    await refresh();
  };

  const toggleSelected = (message: ChatMessage) => {
    setSelected((prev) => (prev.includes(message.id) ? prev.filter((id) => id !== message.id) : [...prev, message.id]));
  };

  const deleteSelected = async () => {
    const targets = messages.filter((message) => selected.includes(message.id));
    if (!targets.length) return;
    const deletable = targets.filter(
      (message) => message.mine || (kind === "group" && payload?.canModerate) || kind === "dm",
    );
    const skipped = targets.length - deletable.length;
    setSelecting(false);
    setSelected([]);
    let removed = 0;
    for (const target of deletable) {
      const canDeleteAll = target.mine || (kind === "group" && payload?.canModerate);
      const result = await api("/api/chat", {
        method: "POST",
        body: { action: "delete", kind, scopeId: id, messageId: target.id, mode: canDeleteAll ? "all" : "me" },
      });
      if (result.ok) removed += 1;
    }
    const removedIds = new Set(deletable.map((message) => message.id));
    setOptimistic((prev) => prev.filter((message) => !removedIds.has(message.id)));
    toast(t("chat.deletedCount", { count: removed }), removed === targets.length ? "success" : "info");
    if (skipped > 0) toast(t("chat.skippedCount", { count: skipped }), "info");
    await refresh();
  };

  const togglePin = async (message: ChatMessage) => {
    setActionMessage(null);
    const result = await api("/api/chat", { method: "POST", body: { action: "pin", kind, scopeId: id, messageId: message.id, pinned: !message.pinned } });
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    toast(message.pinned ? t("chat.unpinnedToast") : t("chat.pinnedToast"), "success");
    await refresh();
  };

  const jumpTo = async (messageId: string) => {
    setPinsOpen(false);
    setSearchOpen(false);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const current = payload?.messages ?? [];
      const index = rows.findIndex((row) => row.type === "message" && row.message.id === messageId);
      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: "center" });
        return;
      }
      const oldest = current[0]?.createdAt;
      if (!oldest) return;
      const next = await loadPayload({ quiet: true, before: oldest });
      if (!next?.hasMore) return;
    }
    toast(t("chat.noResults"), "info");
  };

  const runSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const result = await api<ChatPayload>(`/api/chat?kind=${kind}&id=${id}&search=${encodeURIComponent(term.trim())}`);
    if (result.ok) setSearchResults(result.data.messages.filter((message) => message.body));
  };

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    setAtBottom(bottom);
    if (bottom) setNewCount(0);
    if (element.scrollTop < 60 && hasMore && !loadingOlder) {
      const oldest = payload?.messages[0]?.createdAt;
      if (oldest) {
        setLoadingOlder(true);
        void loadPayload({ before: oldest }).finally(() => setLoadingOlder(false));
      }
    }
  };

  useEffect(() => {
    if (atBottom && rows.length) scrollToBottom();
    else if (payload) setNewCount((count) => count + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const composerDisabled = !payload?.canPost;
  const composerReason =
    payload?.postBlockedReason === "restricted"
      ? t("chat.restrictedComposer")
      : payload?.postBlockedReason === "muted"
        ? t("chat.mutedComposer")
        : payload?.postBlockedReason === "blocked"
          ? t("chat.blockedReason")
          : t("chat.blockedComposer");

  const mentionCandidates = mentionQuery !== null ? scopeMembers.filter((member) => member.id !== myId && member.username.startsWith(mentionQuery)).slice(0, 6) : [];
  const isIosDevice = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="relative flex flex-col overflow-hidden" style={{ height }}>
      {!embedded && payload ? (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
          <Link href={kind === "dm" ? "/home" : "/groups"} className="flex h-10 w-10 items-center justify-center" aria-label={t("common.back")}>
            <ArrowLeft size={18} />
          </Link>
          {kind === "dm" && peer ? (
            <Link href={`/u/${peer.username}`} className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar name={peer.displayName} src={peer.avatarUrl} size={34} online={peer.online ? true : undefined} />
              <span className="min-w-0">
                <span className="flex items-baseline gap-1 truncate text-[14px] font-semibold">
                  {peer.displayName}
                  <NameWithTag name="" role={peer.role} title={peer.title} size={10.5} />
                </span>
                <span className="muted tiny block">
                  {peer.online ? t("chat.online") : peer.showLastSeen && peer.lastSeenAt ? t("chat.lastSeen", { time: formatListTime(peer.lastSeenAt, locale, { yesterday: t("common.yesterday") }) }) : t("chat.offline")}
                </span>
              </span>
            </Link>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--card)]">
                <Users size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{payload?.group?.name ?? t("groups.title")}</span>
                <span className="muted tiny block">{t("groups.memberCount", { count: payload?.members.length ?? 0 })}</span>
              </span>
            </span>
          )}
          <button type="button" className="flex h-10 w-10 items-center justify-center" aria-label={t("chat.search")} onClick={() => setSearchOpen(true)}>
            <Search size={18} />
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center" aria-label={t("chat.messageMenu")} onClick={() => setMenuOpen(true)}>
            <MoreVertical size={18} />
          </button>
        </div>
      ) : null}

      <ConnectionBar pendingCount={pendingCount} />

      {payload?.pinned.length ? (
        <button
          type="button"
          onClick={() => setPinsOpen(true)}
          className="flex items-center gap-2 truncate border-b border-[var(--border)] bg-[rgba(49,139,255,0.08)] px-3 py-1.5 text-left text-[11.5px]"
        >
          <Pin size={12} className="flex-none" style={{ color: "var(--electric)" }} />
          <span className="truncate">
            <b>{payload.pinned[0].senderName}:</b> {payload.pinned[0].preview}
          </span>
        </button>
      ) : null}

      <div ref={scrollRef} onScroll={onScroll} className="hide-scroll flex-1 overflow-y-auto px-2.5 py-2" style={{ overscrollBehavior: "contain" }}>
        {loading ? (
          <div className="flex h-full items-center justify-center"><Spinner size={22} /></div>
        ) : error && !payload ? (
          <ErrorState message={t("chat.loadFailed")} retryLabel={t("common.retry")} onRetry={() => void loadPayload()} />
        ) : !rows.length ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={<Smile size={20} />} title={t("chat.emptyTitle")} body={t("chat.emptyBody")} />
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {loadingOlder ? <div className="absolute left-1/2 top-0 -translate-x-1/2"><Spinner /></div> : null}
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.type === "date" ? (
                    <div className="flex justify-center py-2">
                      <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-0.5 text-[10px] text-[var(--text-2)]">{row.label}</span>
                    </div>
                  ) : row.type === "unread" ? (
                    <div className="flex items-center gap-2 py-2">
                      <span className="h-px flex-1" style={{ background: "var(--pink)" }} />
                      <span className="text-[10px] font-semibold" style={{ color: "var(--pink)" }}>{t("chat.unreadDivider")}</span>
                      <span className="h-px flex-1" style={{ background: "var(--pink)" }} />
                    </div>
                  ) : (
                    <MessageRow
                      message={row.message}
                      previous={(() => {
                        const previousRow = rows[virtualRow.index - 1];
                        return previousRow?.type === "message" ? previousRow.message : null;
                      })()}
                      group={kind === "group" && row.message.sender.id !== "me" && !row.message.mine ? row.message.sender : null}
                      locale={locale}
                      localPreview={
                        row.message.media
                          ? localPreviews[row.message.media.id] ??
                            (row.message.media.kind === "voice" ? null : thumbUrl(row.message.media))
                          : null
                      }
                      onOpenMedia={() => openMedia(row.message, messages)}
                      onLongPress={() => setActionMessage(row.message)}
                      onShowReaders={() => setReadersOpen(row.message)}
                      onReact={(emoji) => void react(row.message, emoji)}
                      onJump={(messageId) => void jumpTo(messageId)}
                      onRetry={(message) => {
                        setOptimistic((prev) => prev.map((entry) => (entry.clientMessageId === message.clientMessageId ? { ...entry, status: "queued" } : entry)));
                        void syncOutbox();
                      }}
                      onDiscard={(message) => {
                        setOptimistic((prev) => prev.filter((entry) => entry.clientMessageId !== message.clientMessageId));
                        if (message.clientMessageId) void offline.removeMessage(message.clientMessageId);
                      }}
                      selecting={selecting}
                      selected={selected.includes(row.message.id)}
                      onSelect={() => toggleSelected(row.message)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!atBottom ? (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-[76px] right-3 z-10 flex h-10 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 text-[11px]"
          aria-label={t("chat.scrollBottom")}
        >
          {newCount > 0 ? <span className="badge">{newCount}</span> : null}
          <ArrowDown size={15} />
        </button>
      ) : null}

      {payload?.typing.length ? (
        <p className="px-3 pb-0.5 text-[10.5px] italic text-[var(--text-2)]">
          {payload.typing.length > 1 ? t("chat.typingMany") : t("chat.typing", { name: payload.typing[0] })}
        </p>
      ) : null}

      {selecting ? (
        <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <span className="text-[12px] font-semibold">{t("chat.selectedCount", { count: selected.length })}</span>
          <button type="button" className="muted ml-auto text-[11.5px] underline" onClick={() => { setSelecting(false); setSelected([]); }}>
            {t("chat.cancelSelection")}
          </button>
          <button type="button" className="btn btn-danger min-h-[32px] px-3 text-[11.5px]" disabled={!selected.length} onClick={() => void deleteSelected()}>
            {t("chat.deleteSelected")}
          </button>
        </div>
      ) : null}

      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
        {replyTo || editing ? (
          <div className="mb-1 flex items-center gap-2 rounded-[8px] border-l-2 bg-[var(--card)] px-2 py-1" style={{ borderLeftColor: "var(--electric)" }}>
            <span className="min-w-0 flex-1 truncate text-[11px]">
              <b>{editing ? t("chat.editing") : t("chat.replyingTo", { name: replyTo?.sender.displayName ?? "" })}</b>
              <span className="muted block truncate">{editing ? editing.body : (replyTo?.body ?? `[${replyTo?.kind}]`)}</span>
            </span>
            <button
              type="button"
              aria-label={t("common.cancel")}
              onClick={() => {
                setReplyTo(null);
                setEditing(null);
                setText("");
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}

        {mentionCandidates.length ? (
          <div className="mb-1 max-h-32 overflow-y-auto rounded-[8px] border border-[var(--border)] bg-[var(--card)]">
            {mentionCandidates.map((member) => (
              <button
                key={member.id}
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px]"
                onClick={() => {
                  setText((value) => value.replace(/@[a-z0-9._]*$/i, `@${member.username} `));
                  setMentionQuery(null);
                  inputRef.current?.focus();
                }}
              >
                <Avatar name={member.displayName} src={member.avatarUrl} size={20} />
                {member.displayName} <span className="muted">@{member.username}</span>
              </button>
            ))}
          </div>
        ) : null}

        {recording ? (
          <div className="flex items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-2 py-1.5">
            <span className="flex h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />
            <span className="text-[12px]">{t("chat.recording", { time: formatDuration(recording.seconds) })}</span>
            {recording.url ? (
              <audio controls src={recording.url} className="h-8 flex-1" />
            ) : (
              <span className="muted flex-1 text-[11px]">{t("chat.voiceCancel")}</span>
            )}
            <button type="button" className="rounded-full px-2 py-1 text-[11px]" onClick={() => stopRecording(true)}>
              {t("chat.voiceDelete")}
            </button>
            {recording.blob ? (
              <button type="button" className="btn btn-primary min-h-[32px] px-3 text-[11px]" onClick={() => void sendVoice()}>
                <Send size={13} /> {t("common.send")}
              </button>
            ) : (
              <button type="button" className="btn btn-primary min-h-[32px] px-3 text-[11px]" onClick={() => stopRecording(false)}>
                <Square size={12} /> {t("common.done")}
              </button>
            )}
          </div>
        ) : composerDisabled ? (
          <p className="px-2 py-2 text-center text-[12px]" style={{ color: "var(--warning)" }}>{composerReason}</p>
        ) : (
          <div className="flex items-end gap-1.5">
            <button type="button" className="flex h-11 w-9 flex-none items-center justify-center text-[var(--text-2)]" aria-label={t("chat.attach")} onClick={() => setAttachOpen(true)}>
              <Paperclip size={19} />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              placeholder={t("common.message")}
              onChange={(event) => {
                const value = event.target.value;
                setText(value);
                void offline.saveDraft(key, value);
                const match = /@([a-z0-9._]*)$/i.exec(value);
                setMentionQuery(match ? match[1].toLowerCase() : null);
                if (Date.now() - typingSent.current > 3000) {
                  typingSent.current = Date.now();
                  void api("/api/chat", { method: "POST", body: { action: "typing", kind, scopeId: id } });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (editing) void submitEdit();
                  else if (text.trim()) {
                    void sendMessage({ body: text.trim(), messageType: "text", replyId: replyTo?.id ?? null });
                    setText("");
                    void offline.clearDraft(key);
                  }
                }
              }}
              className="field max-h-[132px] min-h-[42px] flex-1 resize-none py-2.5 text-[13.5px]"
              style={{ lineHeight: 1.4 }}
            />
            {text.trim() ? (
              <button
                type="button"
                className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-white"
                style={{ background: "linear-gradient(120deg,#318BFF,#8B4DFF)" }}
                aria-label={t("common.send")}
                onClick={() => {
                  if (editing) void submitEdit();
                  else {
                    void sendMessage({ body: text.trim(), messageType: "text", replyId: replyTo?.id ?? null });
                    setText("");
                    void offline.clearDraft(key);
                  }
                }}
              >
                <Send size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-white"
                style={{ background: "linear-gradient(120deg,#8B4DFF,#D946EF)" }}
                aria-label={t("chat.voiceHold")}
                onClick={() => void startRecording()}
              >
                <Mic size={18} />
              </button>
            )}
          </div>
        )}
        {isIosDevice && !recording ? <p className="px-2 pt-1 text-[9.5px] text-[var(--text-2)]">{t("chat.voiceHintIos")}</p> : null}
      </div>

      <input id="chat-file-input" type="file" multiple className="hidden" onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); event.target.value = ""; }} />
      <input id="chat-gallery-input" type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); event.target.value = ""; }} />

      <Sheet open={attachOpen} onClose={() => setAttachOpen(false)} title={t("chat.attach")}>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn btn-ghost justify-start" onClick={() => document.getElementById("chat-gallery-input")?.click()}>
            <Paperclip size={16} /> {t("chat.gallery")}
          </button>
          <button type="button" className="btn btn-ghost justify-start" onClick={() => document.getElementById("chat-file-input")?.click()}>
            <FileText size={16} /> {t("chat.files")}
          </button>
          <p className="muted tiny">{t("chat.fileTooLarge", { mb: MAX_UPLOAD_MB })}</p>
        </div>
      </Sheet>

      <Sheet open={Boolean(actionMessage)} onClose={() => setActionMessage(null)} title={t("chat.messageMenu")}>
        {actionMessage ? (
          <div className="flex flex-col gap-2">
            <div className="flex justify-center gap-1 rounded-[10px] bg-[var(--surface)] py-1.5">
              {REACTIONS.map((emoji) => (
                <button key={emoji} type="button" className="flex h-10 w-10 items-center justify-center text-[19px]" onClick={() => void react(actionMessage, emoji)} aria-label={emoji}>
                  {emoji}
                </button>
              ))}
            </div>
            {!actionMessage.deleted ? (
              <button type="button" className="btn btn-ghost justify-start" onClick={() => { setReplyTo(actionMessage); setActionMessage(null); inputRef.current?.focus(); }}>
                {t("chat.reply")}
              </button>
            ) : null}
            {actionMessage.body && !actionMessage.deleted ? (
              <button
                type="button"
                className="btn btn-ghost justify-start"
                onClick={async () => {
                  await navigator.clipboard.writeText(actionMessage.body ?? "");
                  setActionMessage(null);
                  toast(t("chat.copied"), "success");
                }}
              >
                {t("chat.copy")}
              </button>
            ) : null}
            {!actionMessage.pending && !actionMessage.deleted ? (
              <button type="button" className="btn btn-ghost justify-start" onClick={() => void togglePin(actionMessage)}>
                <Pin size={15} /> {actionMessage.pinned ? t("chat.unpin") : t("chat.pin")}
              </button>
            ) : null}
            {actionMessage.mine && actionMessage.kind === "text" && !actionMessage.deleted && !actionMessage.pending ? (
              <button type="button" className="btn btn-ghost justify-start" onClick={() => { setEditing(actionMessage); setText(actionMessage.body ?? ""); setActionMessage(null); }}>
                {t("chat.edit")}
              </button>
            ) : null}
            {actionMessage.mine && kind === "dm" && !actionMessage.pending ? (
              <button type="button" className="btn btn-ghost justify-start" onClick={() => void requestDelete(actionMessage)}>
                {t("chat.deleteForMe")}
              </button>
            ) : null}
            {!actionMessage.pending && (actionMessage.mine || (kind === "group" && payload?.canModerate)) ? (
              <button type="button" className="btn btn-danger justify-start" onClick={() => setDeleteConfirm({ message: actionMessage, mode: "all" })}>
                {t("chat.deleteForEveryone")}
              </button>
            ) : null}
            {actionMessage.media ? (
              <a href={`/api/media/${actionMessage.media.id}?download=1`} className="btn btn-ghost justify-start" download>
                <Download size={15} /> {t("viewer.download")}
              </a>
            ) : null}
            {!actionMessage.pending && !actionMessage.deleted ? (
              <DeleteMenuItem
                type="message"
                targetId={actionMessage.id}
                label={actionMessage.body ?? actionMessage.media?.name ?? t("chat.messageMenu")}
                containerId={`${kind}:${id}`}
                onDeleted={(result) => {
                  setActionMessage(null);
                  setOptimistic((prev) => prev.filter((entry) => entry.id !== actionMessage.id));
                  toast(t("delete.done", { files: result.files }), "success");
                  void refresh();
                }}
              />
            ) : null}
            {!actionMessage.mine ? (
              <button type="button" className="btn btn-ghost justify-start" onClick={() => { setReportOpen(true); }}>
                <Flag size={15} /> {t("reports.new")}
              </button>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t("chat.messageMenu")}>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn btn-ghost justify-start" onClick={() => { setMenuOpen(false); setSelected([]); setSelecting(true); }}>
            {t("chat.select")}
          </button>
          <button type="button" className="btn btn-ghost justify-start" onClick={() => { setMenuOpen(false); setPinsOpen(true); }}>
            <Pin size={15} /> {t("chat.pinnedTitle")}
          </button>
          <button type="button" className="btn btn-ghost justify-start" onClick={() => { setMenuOpen(false); setFilesOpen(true); }}>
            <FileText size={15} /> {t("chat.mediaFiles")}
          </button>
          <button type="button" className="btn btn-ghost justify-start" onClick={() => { setMenuOpen(false); setSearchOpen(true); }}>
            <Search size={15} /> {t("chat.searchIn")}
          </button>
          {kind === "dm" && peer ? (
            <button
              type="button"
              className="btn btn-ghost justify-start"
              onClick={async () => {
                const blocked = peer.blockedByMe;
                const result = blocked
                  ? await api(`/api/blocks?userId=${peer.id}`, { method: "DELETE" })
                  : await api("/api/blocks", { method: "POST", body: { userId: peer.id } });
                setMenuOpen(false);
                if (!result.ok) {
                  toast(t("common.error"), "error");
                  return;
                }
                toast(blocked ? t("profile.unblockedToast") : t("profile.blockedToast"), "success");
                await refresh();
              }}
            >
              {peer.blockedByMe ? t("chat.unblock") : t("chat.block")}
            </button>
          ) : null}
          {kind === "dm" ? (
            <button type="button" className="btn btn-ghost justify-start" onClick={() => { setMenuOpen(false); setClearOpen(true); }}>
              {t("chat.clearChat")}
            </button>
          ) : null}
          <BulkDeleteRow kind={kind} id={id} refresh={refresh} />
          {kind === "dm" && peer ? (
            <Link href={`/u/${peer.username}`} className="btn btn-ghost justify-start" onClick={() => setMenuOpen(false)}>
              {t("common.viewProfile")}
            </Link>
          ) : null}
        </div>
      </Sheet>

      <Sheet open={pinsOpen} onClose={() => setPinsOpen(false)} title={t("chat.pinnedTitle")}>
        {payload?.pinned.length ? (
          <div className="flex flex-col gap-1.5">
            {payload.pinned.map((pin) => (
              <button key={pin.id} type="button" className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2 text-left" onClick={() => void jumpTo(pin.id)}>
                <span className="block text-[11px] font-semibold">{pin.senderName}</span>
                <span className="muted block truncate text-[12px]">{pin.preview}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted text-[12.5px]">{t("chat.noPins")}</p>
        )}
      </Sheet>

      <Sheet open={searchOpen} onClose={() => { setSearchOpen(false); setSearchResults(null); }} title={t("chat.searchIn")}>
        <input className="field mb-2" autoFocus value={searchTerm} onChange={(event) => void runSearch(event.target.value)} placeholder={t("chat.searchPlaceholder")} />
        {searchResults?.length ? (
          <div className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
            {searchResults.map((result) => (
              <button key={result.id} type="button" className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2 text-left" onClick={() => void jumpTo(result.id)}>
                <span className="block text-[11px] font-semibold">{result.sender.displayName}</span>
                <span className="muted block truncate text-[12px]">{result.body}</span>
              </button>
            ))}
          </div>
        ) : searchResults ? (
          <p className="muted text-[12.5px]">{t("chat.noResults")}</p>
        ) : null}
      </Sheet>

      <Sheet open={filesOpen} onClose={() => setFilesOpen(false)} title={t("chat.mediaFiles")}>
        <MediaFilesList messages={messages} onOpen={(message) => openMedia(message, messages)} />
      </Sheet>

      <Sheet open={Boolean(readersOpen)} onClose={() => setReadersOpen(null)} title={t("chat.seenByTitle")}>
        {readersOpen?.readBy.length ? (
          <div className="flex flex-col gap-1">
            {readersOpen.readBy.map((reader) => (
              <div key={`${reader.name}-${reader.at}`} className="flex items-center justify-between rounded-[8px] bg-[var(--surface)] px-2 py-1.5 text-[12px]">
                <span>{reader.name}</span>
                <span className="muted tiny">{new Date(reader.at).toLocaleTimeString(locale === "bn" ? "bn-BD" : "en-US", { hour: "numeric", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted text-[12.5px]">{t("chat.noResults")}</p>
        )}
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteConfirm)}
        title={t("chat.deleteTitle")}
        body={t("chat.deleteBody")}
        confirmLabel={deleteConfirm?.mode === "me" ? t("chat.deleteForMe") : t("chat.deleteForEveryone")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteConfirm(null)}
      />

      {actionMessage ? (
        <ReportSheet open={reportOpen} onClose={() => { setReportOpen(false); setActionMessage(null); }} targetType="message" targetId={actionMessage.id} snapshot={(actionMessage.body ?? "").slice(0, 200)} />
      ) : null}
      <ConfirmDialog
        open={clearOpen}
        title={t("chat.clearTitle")}
        body={t("chat.clearBody")}
        confirmLabel={t("chat.clearChat")}
        cancelLabel={t("common.cancel")}
        onConfirm={async () => {
          setClearOpen(false);
          const result = await api("/api/chat", { method: "POST", body: { action: "clear", kind, scopeId: id } });
          if (!result.ok) {
            toast(t("common.error"), "error");
            return;
          }
          toast(t("chat.cleared"), "success");
          await refresh();
          router.refresh();
        }}
        onClose={() => setClearOpen(false)}
      />
      {prefs.reduceMotion ? null : null}
    </div>
  );
}

function MediaFilesList({ messages, onOpen }: { messages: ChatMessage[]; onOpen: (message: ChatMessage) => void }) {
  const { t } = useApp();
  const [filter, setFilter] = useState<"all" | "image" | "video" | "audio" | "document">("all");
  const items = messages.filter((message) => message.media && (filter === "all" || message.media.kind === filter || (filter === "audio" && message.media.kind === "voice")));
  const filters: { key: typeof filter; label: string }[] = [
    { key: "all", label: t("chat.fileFilterAll") },
    { key: "image", label: t("chat.photos") },
    { key: "video", label: t("chat.videos") },
    { key: "audio", label: t("chat.audio") },
    { key: "document", label: t("chat.documents") },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto hide-scroll">
        {filters.map((entry) => (
          <button key={entry.key} type="button" className={`pill min-h-[30px] px-2.5 text-[11px] ${filter === entry.key ? "pill-active" : ""}`} onClick={() => setFilter(entry.key)}>
            {entry.label}
          </button>
        ))}
      </div>
      {items.length === 0 ? <p className="muted text-[12.5px]">{t("chat.noFiles")}</p> : null}
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((message) => (
          <button key={message.id} type="button" onClick={() => onOpen(message)} className="relative aspect-square overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)]" aria-label={message.media?.name}>
            {message.media?.expired ? (
              <span className="flex h-full items-center justify-center px-1 text-center text-[9px] text-[var(--text-2)]">{t("viewer.expired")}</span>
            ) : message.media?.kind === "image" || message.media?.kind === "video" ? (
              <>
                <img src={thumbUrl(message.media)} alt="" width={120} height={120} loading="lazy" className="h-full w-full object-cover" />
                {message.media.kind === "video" ? (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">{formatDuration(message.media.duration)}</span>
                ) : null}
              </>
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1 px-1 text-center">
                <FileText size={18} />
                <span className="line-clamp-2 text-[9px]">{message.media?.name}</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  previous,
  group,
  locale,
  localPreview,
  onOpenMedia,
  onLongPress,
  onShowReaders,
  onReact,
  onJump,
  onRetry,
  onDiscard,
  selecting = false,
  selected = false,
  onSelect,
}: {
  message: ChatMessage;
  previous: ChatMessage | null;
  group: ChatMessage["sender"] | null;
  locale: "en" | "bn";
  localPreview: string | null;
  onOpenMedia: () => void;
  onLongPress: () => void;
  onShowReaders: () => void;
  onReact: (emoji: string) => void;
  onJump: (messageId: string) => void;
  onRetry: (message: ChatMessage) => void;
  onDiscard: (message: ChatMessage) => void;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { t } = useApp();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mine = message.mine || message.sender.id === "me";
  const grouped = previous && previous.sender.id === message.sender.id && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000;
  const time = new Date(message.createdAt).toLocaleTimeString(locale === "bn" ? "bn-BD" : "en-US", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit", hour12: true }).replace(/\./g, "").toUpperCase();

  return (
    <div className={`flex gap-1.5 pb-1 ${mine ? "justify-end" : "justify-start"}`} style={selecting && selected ? { background: "rgba(49,139,255,0.12)", borderRadius: 12 } : undefined}>
      {selecting ? (
        <button
          type="button"
          onClick={onSelect}
          aria-label={t("chat.select")}
          aria-pressed={selected}
          className="mt-2 flex h-6 w-6 flex-none items-center justify-center rounded-full border"
          style={{ borderColor: selected ? "var(--electric)" : "var(--border)", background: selected ? "var(--electric)" : "var(--card)", color: "#04101f" }}
        >
          {selected ? "✓" : ""}
        </button>
      ) : null}
      {!mine ? (
        <div className="w-6 flex-none self-end">
          {group && !grouped ? <Avatar name={group.displayName} src={group.avatarUrl} size={24} ring={false} /> : null}
        </div>
      ) : null}
      <div className={`min-w-0 max-w-[82%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
        {group && !grouped ? (
          <span className="mb-0.5 flex items-baseline gap-1 text-[11px]">
            <span className="font-semibold">{group.displayName}</span>
            <NameWithTag name="" role={group.role} title={group.title} size={10} />
          </span>
        ) : null}
        <div
          onPointerDown={() => {
            pressTimer.current = setTimeout(() => onLongPress(), 480);
          }}
          onPointerUp={() => {
            if (pressTimer.current) clearTimeout(pressTimer.current);
          }}
          onPointerLeave={() => {
            if (pressTimer.current) clearTimeout(pressTimer.current);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onLongPress();
          }}
          className="relative w-full rounded-[18px] px-2.5 py-1.5"
          style={
            mine
              ? { background: "linear-gradient(120deg,#2f7cf6,#7a49f5)", color: "#fff", borderBottomRightRadius: 6 }
              : { background: "var(--card)", border: "1px solid var(--border)", borderBottomLeftRadius: 6 }
          }
        >
          {message.deleted ? (
            <p className="text-[12.5px] italic opacity-80">{t("chat.deletedMessage")}</p>
          ) : (
            <>
              {message.replyTo ? (
                <button type="button" onClick={() => onJump(message.replyTo!.id)} className="mb-1 flex w-full items-start gap-1.5 rounded-[8px] border-l-2 px-1.5 py-1 text-left" style={{ borderLeftColor: mine ? "#ffffff" : "var(--electric)", background: mine ? "rgba(255,255,255,0.14)" : "rgba(49,139,255,0.1)" }}>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold">{message.replyTo.senderName}</span>
                    <span className="block truncate text-[11px] opacity-80">{message.replyTo.preview}</span>
                  </span>
                </button>
              ) : null}

              {message.media && !message.media.expired && (message.media.kind === "image" || message.media.kind === "video") ? (
                <button type="button" onClick={onOpenMedia} className="relative mb-1 block w-full overflow-hidden rounded-[14px]" style={{ aspectRatio: message.media.width && message.media.height ? `${message.media.width} / ${message.media.height}` : "4 / 3" }} aria-label={message.media.name}>
                  <img src={localPreview ?? thumbUrl(message.media)} alt={message.media.name} width={message.media.width ?? 320} height={message.media.height ?? 240} loading="lazy" className="h-full w-full object-cover" />
                  {message.media.kind === "video" ? (
                    <>
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white">▶</span>
                      </span>
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{formatDuration(message.media.duration)}</span>
                      {(message.media.height ?? 0) >= 720 ? <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[9px] font-bold text-white">HD</span> : null}
                    </>
                  ) : null}
                  {message.media.size > 5 * 1024 * 1024 ? <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">{formatBytes(message.media.size)}</span> : null}
                </button>
              ) : message.media && !message.media.expired && (message.media.kind === "audio" || message.media.kind === "voice") ? (
                <button type="button" onClick={onOpenMedia} className="mb-1 flex w-full items-center gap-2 rounded-[10px] bg-[rgba(0,0,0,0.18)] px-2 py-1.5 text-left">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">▶</span>
                  <span className="flex-1 text-[11px]">{t("chat.voiceNote")}</span>
                  <span className="text-[10px] opacity-80">{formatDuration(message.media.duration)}</span>
                </button>
              ) : message.media && !message.media.expired ? (
                <div className="mb-1 flex items-center gap-2 rounded-[10px] bg-[rgba(0,0,0,0.16)] px-2 py-1.5">
                  <FileText size={18} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium">{message.media.name}</span>
                    <span className="block text-[10px] opacity-75">{formatBytes(message.media.size)}</span>
                  </span>
                  <a href={`/api/media/${message.media.id}?download=1`} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20" aria-label={t("viewer.download")} download>
                    <Download size={13} />
                  </a>
                </div>
              ) : message.media?.expired ? (
                <div className="mb-1 flex items-center gap-2 rounded-[10px] border border-dashed border-white/30 bg-black/10 px-2 py-2">
                  <FileText size={16} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium">{message.media.name}</span>
                    <span className="block text-[10px] opacity-80">{t("viewer.expired")}</span>
                  </span>
                </div>
              ) : null}

              {message.body ? (
                <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug" style={{ userSelect: "text" }}>
                  <RichText text={message.body} members={[]} />
                </p>
              ) : null}
            </>
          )}

          <div className="mt-0.5 flex items-center justify-end gap-1 text-[9.5px] opacity-80">
            {message.editedAt && !message.deleted ? <span>{t("chat.edited")}</span> : null}
            <span>{time}</span>
            {mine ? statusIcon(message.status) : null}
          </div>
        </div>

        {message.failed || message.status === "failed" ? (
          <span className="mt-0.5 flex items-center gap-2 text-[10px]" style={{ color: "var(--danger)" }}>
            {t("chat.sendFailed")}
            <button type="button" className="underline" onClick={() => onRetry(message)}>{t("chat.retrySend")}</button>
            <button type="button" className="underline" onClick={() => onDiscard(message)}>{t("common.delete")}</button>
          </span>
        ) : message.status === "queued" ? (
          <span className="mt-0.5 text-[10px]" style={{ color: "var(--warning)" }}>{t("chat.waitingInternet")}</span>
        ) : null}

        {message.reactions.length ? (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(reaction.emoji)}
                className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px]"
                style={{ borderColor: reaction.mine ? "var(--electric)" : "var(--border)", background: "var(--card)" }}
                title={reaction.names.join(", ")}
              >
                <span>{reaction.emoji}</span>
                {reaction.count}
              </button>
            ))}
          </div>
        ) : null}

        {mine && message.readCount > 0 && message.sender.id !== "me" ? null : null}
        {mine && !message.pending && !message.deleted && message.readCount > 0 ? (
          <button type="button" className="muted mt-0.5 text-[9.5px] underline" onClick={onShowReaders}>
            {t("chat.seenBy", { count: message.readCount })}
          </button>
        ) : null}
      </div>
      <div className="flex w-6 flex-none items-end">
        {mine ? null : (
          <button type="button" className="muted flex h-6 w-6 items-center justify-center opacity-45" aria-label={t("chat.reactions")} onClick={onLongPress}>
            <MoreVertical size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function BulkDeleteRow({ kind, id, refresh }: { kind: "dm" | "group"; id: string; refresh: () => Promise<void> }) {
  const { t } = useApp();
  return (
    <DeleteMenuItem
      type={kind === "group" ? "group_all" : "dm_all"}
      targetId={id}
      label={kind === "group" ? t("chat.bulkGroup") : t("chat.bulkDm")}
      typing
      onDeleted={() => void refresh()}
    />
  );
}

export const _mediaUrl = mediaUrl;
export const _linkIcon = Link2;
