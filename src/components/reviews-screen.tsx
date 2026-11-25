"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CalendarDays,
  Clapperboard,
  MessageCircle,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { useViewer } from "./media-viewer-provider";
import { Avatar, ConfirmDialog, EmptyState, ErrorState, ListSkeleton, NameWithTag, ScreenHeader, Sheet, Spinner } from "./ui";
import { formatBytes, formatDuration } from "@/lib/media-types";
import type { MediaItem } from "@/lib/media-types";
import { thumbUrl } from "@/lib/media-types";
import { formatDateShort, formatDateTime, formatListTime } from "@/lib/time";
import { prepareUpload, uploadMedia } from "@/lib/upload-client";
import type { ReviewCommentItem, ReviewDetail, ReviewItem } from "@/app/api/reviews/route";
import { Crown, Play } from "lucide-react";

const GAME_COLORS: Record<string, string> = { "Free Fire": "#FFC53D", Minecraft: "#22C55E", Roblox: "#4FC3FF" };

function gameColor(game: string) {
  return GAME_COLORS[game] ?? "var(--text)";
}

export function ReviewsScreen({ startPosting = false }: { startPosting?: boolean }) {
  const { t, toast, locale } = useApp();
  const { open: openViewer } = useViewer();
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"all" | "unread" | "mine">("all");
  const [type, setType] = useState<"all" | "shorts" | "long">("all");
  const [sort, setSort] = useState<"recent" | "top" | "pending" | "approved">("recent");
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [canPost, setCanPost] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [commentsFor, setCommentsFor] = useState<ReviewItem | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("filter", tab === "mine" ? "mine" : sort === "recent" || sort === "top" ? (tab === "unread" ? "unread" : sort) : sort);
    if (type !== "all") params.set("type", type);
    if (query.trim()) params.set("q", query.trim());
    const result = await api<{ items: ReviewItem[]; canPost: boolean; canModerate: boolean }>(`/api/reviews?${params.toString()}`);
    if (result.ok) {
      setItems(result.data.items);
      setCanPost(result.data.canPost);
      setCanModerate(result.data.canModerate);
      setError(false);
    } else {
      setError(true);
    }
  }, [tab, type, sort, query]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (startPosting && canPost) setPostOpen(true);
  }, [startPosting, canPost]);

  useEffect(() => {
    const update = () => setOffset(listRef.current?.offsetTop ?? 0);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [items]);

  const virtualizer = useVirtualizer({
    count: items?.length ?? 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 290,
    overscan: 4,
    scrollMargin: offset,
  });

  const openReviewMedia = (review: ReviewItem, index = 0) => {
    if (!review.media.length) return;
    openViewer({
      title: review.title,
      items: review.media,
      index,
      actions: ["like", "dislike", "comments"],
      onLike: () => void react(review, "LIKE"),
      onDislike: () => void react(review, "DISLIKE"),
      onComments: () => setCommentsFor(review),
    });
  };

  const react = async (review: ReviewItem, reaction: "LIKE" | "DISLIKE") => {
    setItems((prev) =>
      prev
        ? prev.map((item) => {
            if (item.id !== review.id) return item;
            const had = item.myReaction === reaction;
            const likes = item.likeCount + (reaction === "LIKE" ? (had ? -1 : 1) : item.myReaction === "LIKE" ? -1 : 0);
            const dislikes = item.dislikeCount + (reaction === "DISLIKE" ? (had ? -1 : 1) : item.myReaction === "DISLIKE" ? -1 : 0);
            return { ...item, likeCount: Math.max(likes, 0), dislikeCount: Math.max(dislikes, 0), myReaction: had ? null : reaction };
          })
        : prev,
    );
    await api("/api/reviews", { method: "POST", body: { action: "react", reviewId: review.id, reaction } });
    void load();
  };

  return (
    <>
      <ScreenHeader
        title={t("reviews.title")}
        art="/brand/header-reviews.webp"
        right={
          <button type="button" className="icon-btn" aria-label={t("reviews.search")} onClick={() => setSearchOpen((value) => !value)}>
            {searchOpen ? <X size={18} /> : <Search size={18} />}
          </button>
        }
      />
      <div className="screen flex flex-col gap-2" style={{ paddingTop: 10 }}>
        <div className="flex gap-1.5">
          {(["all", "unread", "mine"] as const).map((value) => (
            <button key={value} type="button" className={`pill flex-1 px-2 text-[11.5px] ${tab === value ? "pill-active" : ""}`} onClick={() => setTab(value)}>
              {value === "all" ? t("reviews.all") : value === "unread" ? t("reviews.unread") : t("reviews.mine")}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={`pill flex-1 text-[11.5px] ${type === "all" ? "pill-active" : ""}`} onClick={() => setType("all")}>
            {t("reviews.all")}
          </button>
          <button type="button" className={`pill flex-1 text-[11.5px] ${type === "shorts" ? "pill-active" : ""}`} onClick={() => setType("shorts")}>
            {t("reviews.shorts")}
          </button>
          <button type="button" className={`pill flex-1 text-[11.5px] ${type === "long" ? "pill-active" : ""}`} onClick={() => setType("long")}>
            {t("reviews.long")}
          </button>
          <button type="button" className="pill px-2.5" aria-label={t("reviews.filters")} onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal size={14} />
          </button>
        </div>

        {searchOpen ? (
          <input
            className="field"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("reviews.searchPlaceholder")}
            aria-label={t("reviews.search")}
          />
        ) : null}

        {error && !items ? <ErrorState message={t("reviews.loadFailed")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {!items && !error ? <ListSkeleton rows={3} /> : null}
        {items && items.length === 0 ? (
          <EmptyState
            icon={<Clapperboard size={22} />}
            title={
              tab === "unread" ? t("reviews.emptyUnread") : tab === "mine" ? t("reviews.emptyMine") : sort === "pending" ? t("reviews.emptyPending") : t("reviews.emptyAll")
            }
            body={t("reviews.emptyAllBody")}
          />
        ) : null}

        <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const review = items?.[virtualRow.index];
            if (!review) return null;
            return (
              <div
                key={review.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start - offset}px)`, paddingBottom: 10 }}
              >
                <ReviewCard
                  review={review}
                  locale={locale}
                  onOpenMedia={(index) => openReviewMedia(review, index)}
                  onOpenDetail={() => router.push(`/reviews/${review.id}`)}
                  onReact={(reaction) => void react(review, reaction)}
                  onComments={() => setCommentsFor(review)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {canPost ? (
        <button
          type="button"
          className="fixed bottom-[calc(104px+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full text-white sm:left-auto sm:right-[calc(50%-230px)] sm:translate-x-0"
          style={{ background: "linear-gradient(140deg,#FF3B6B,#8B4DFF)" }}
          aria-label={t("reviews.new")}
          onClick={() => setPostOpen(true)}
        >
          <Plus size={22} />
        </button>
      ) : null}

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t("reviews.filterTitle")}>
        <div className="flex flex-col gap-2">
          {([
            ["recent", t("reviews.recent")],
            ["top", t("reviews.topRated")],
            ...(canModerate ? ([["pending", t("reviews.pending")], ["approved", t("reviews.approved")]] as const) : []),
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn justify-start ${sort === value ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setSort(value);
                setFilterOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Sheet>

      <ReviewPostSheet
        open={postOpen}
        onClose={() => setPostOpen(false)}
        onPosted={async (pending) => {
          setPostOpen(false);
          toast(pending ? t("reviews.pendingToast") : t("reviews.published"), "success");
          await load();
        }}
        onError={(message) => toast(message, "error")}
      />

      {commentsFor ? (
        <ReviewCommentsSheet
          reviewId={commentsFor.id}
          title={commentsFor.title}
          onClose={() => setCommentsFor(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </>
  );
}

function ReviewCard({
  review,
  locale,
  onOpenMedia,
  onOpenDetail,
  onReact,
  onComments,
}: {
  review: ReviewItem;
  locale: "en" | "bn";
  onOpenMedia: (index: number) => void;
  onOpenDetail: () => void;
  onReact: (reaction: "LIKE" | "DISLIKE") => void;
  onComments: () => void;
}) {
  const { t } = useApp();
  const shorts = review.kind === "SHORTS";
  const first = review.media[0];
  const hd = (first?.height ?? 0) >= 720;
  return (
    <article className="g-card p-2.5">
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex items-center gap-1.5 rounded-r-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
          style={{
            background: shorts ? "linear-gradient(100deg,#FF3B6B,#D946EF)" : "linear-gradient(100deg,#318BFF,#8B4DFF)",
            color: "#fff",
            clipPath: "polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)",
          }}
        >
          {shorts ? <Clapperboard size={11} /> : <Play size={11} fill="currentColor" />}
          {shorts ? t("reviews.shorts") : t("reviews.long")}
        </span>
        <span className="flex items-center gap-1 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-2)]">
          <CalendarDays size={10} /> {formatDateShort(review.createdAt)}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onOpenDetail} className="min-w-0 flex-1 text-left">
          <span className="flex items-start gap-1.5">
            <Avatar name={review.author.displayName} src={review.author.avatarUrl} size={32} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-1 text-[12.5px]">
                <span className="font-semibold">{review.author.displayName}</span>
                {review.author.role === "OWNER" ? <Crown size={12} style={{ color: "var(--gold)" }} /> : null}
                <NameWithTag name="" role={review.author.role} title={review.author.title} size={10.5} />
              </span>
              <span className="muted tiny block">
                {review.author.role === "OWNER" ? "Owner" : t(`role.${review.author.role}` as "role.MEMBER")} ·{" "}
                {formatListTime(review.createdAt, locale, { yesterday: t("common.yesterday") })}
              </span>
              <span className="mt-0.5 block text-[12px]">
                {t("reviews.game")}- <b style={{ color: gameColor(review.game) }}>{review.game}</b>
              </span>
            </span>
          </span>
          <span className="mt-1.5 block text-[13px] font-semibold leading-snug">{review.title}</span>
          {review.description ? <span className="muted mt-0.5 line-clamp-2 block text-[11.5px]">{review.description}</span> : null}
          {review.status !== "APPROVED" ? (
            <span className="mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9.5px]" style={{ background: "rgba(245,158,11,0.15)", color: "var(--warning)" }}>
              {review.status === "PENDING" ? t("reviews.pendingBadge") : t("reviews.hiddenBadge")}
            </span>
          ) : null}
        </button>
        {first ? (
          <button
            type="button"
            onClick={() => onOpenMedia(0)}
            className="relative aspect-[4/3] w-[120px] flex-none overflow-hidden rounded-[10px] border border-[var(--border)]"
            aria-label={t("reviews.openViewer")}
          >
            {first.expired ? (
              <span className="flex h-full flex-col items-center justify-center gap-1 px-1 text-center text-[9px] text-[var(--text-2)]">
                <Clapperboard size={16} /> {t("reviews.expired")}
              </span>
            ) : (
              <>
                <img src={thumbUrl(first)} alt="" width={120} height={90} loading="lazy" className="h-full w-full object-cover" />
                {first.kind === "video" ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play size={14} fill="white" />
                    </span>
                  </span>
                ) : null}
                {hd ? <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[8.5px] font-bold text-white">{t("reviews.hd")}</span> : null}
                {review.media.length > 1 ? (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">{t("reviews.moreItems", { count: review.media.length - 1 })}</span>
                ) : first.kind === "video" && first.duration ? (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">{formatDuration(first.duration)}</span>
                ) : null}
              </>
            )}
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          className="pill min-h-[30px] gap-1 px-2.5 text-[11px]"
          style={review.myReaction === "LIKE" ? { background: "linear-gradient(100deg,#318BFF,#4FC3FF)", color: "#fff", borderColor: "transparent" } : undefined}
          onClick={() => onReact("LIKE")}
          aria-pressed={review.myReaction === "LIKE"}
        >
          <ThumbsUp size={12} /> {review.likeCount}
        </button>
        <button
          type="button"
          className="pill min-h-[30px] gap-1 px-2.5 text-[11px]"
          style={review.myReaction === "DISLIKE" ? { background: "linear-gradient(100deg,#EF4444,#D946EF)", color: "#fff", borderColor: "transparent" } : undefined}
          onClick={() => onReact("DISLIKE")}
          aria-pressed={review.myReaction === "DISLIKE"}
        >
          <ThumbsDown size={12} /> {review.dislikeCount}
        </button>
        <button type="button" className="pill min-h-[30px] gap-1 px-2.5 text-[11px]" onClick={onComments}>
          <MessageCircle size={12} /> {review.commentCount}
        </button>
      </div>
    </article>
  );
}

export function ReviewCommentsSheet({ reviewId, title, onClose, onChanged }: { reviewId: string; title: string; onClose: () => void; onChanged?: () => void }) {
  const { t, toast } = useApp();
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ReviewCommentItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ detail: ReviewDetail }>(`/api/reviews?id=${reviewId}`);
    if (result.ok) setDetail(result.data.detail);
  }, [reviewId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (text.trim().length < 1) return;
    if (text.length > 1000) {
      toast(t("reviews.commentTooLong"), "error");
      return;
    }
    setBusy(true);
    const result = await api("/api/reviews", { method: "POST", body: { action: "comment", reviewId, body: text.trim(), parentId: replyTo?.id ?? null } });
    setBusy(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    setText("");
    setReplyTo(null);
    toast(t("reviews.commentAdded"), "success");
    await load();
    onChanged?.();
  };

  const remove = async (commentId: string) => {
    const result = await api("/api/reviews", { method: "POST", body: { action: "delete-comment", reviewId, commentId } });
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    await load();
    onChanged?.();
  };

  const roots = detail?.comments.filter((comment) => !comment.parentId) ?? [];

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("reviews.commentsTitle")}>
      <div className="w-full max-w-[var(--shell)] rounded-t-[20px] border border-b-0 border-[var(--border)] bg-[var(--card)] p-3" style={{ animation: "sheet-in .2s ease-out both" }} onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="truncate text-[14px] font-semibold">{title}</p>
          <button type="button" className="icon-btn h-9 w-9" onClick={onClose} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="mb-2 max-h-[42dvh] overflow-y-auto">
          {!detail ? <Spinner /> : null}
          {detail && roots.length === 0 ? <p className="muted py-3 text-center text-[12px]">{t("reviews.noComments")}</p> : null}
          {roots.map((comment) => (
            <div key={comment.id} className="mb-2">
              <CommentRow comment={comment} onReply={() => setReplyTo(comment)} onDelete={() => void remove(comment.id)} />
              {detail?.comments
                .filter((entry) => entry.parentId === comment.id)
                .map((reply) => (
                  <div key={reply.id} className="ml-6 mt-1">
                    <CommentRow comment={reply} onReply={() => setReplyTo(comment)} onDelete={() => void remove(reply.id)} />
                  </div>
                ))}
            </div>
          ))}
        </div>
        {replyTo ? (
          <p className="muted mb-1 flex items-center gap-2 text-[11px]">
            {t("reviews.reply")} · {replyTo.author.displayName}
            <button type="button" onClick={() => setReplyTo(null)} aria-label={t("common.cancel")}>
              <X size={12} />
            </button>
          </p>
        ) : null}
        <div className="flex items-center gap-1.5">
          <input className="field" value={text} onChange={(event) => setText(event.target.value)} placeholder={t("reviews.commentPlaceholder")} maxLength={1000} />
          <button type="button" className="btn btn-primary min-h-[42px] px-3" onClick={() => void send()} disabled={busy || !text.trim()}>
            {busy ? <Spinner /> : t("common.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentRow({ comment, onReply, onDelete }: { comment: ReviewCommentItem; onReply: () => void; onDelete: () => void }) {
  const { t } = useApp();
  return (
    <div className="flex items-start gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2">
      <Avatar name={comment.author.displayName} src={comment.author.avatarUrl} size={26} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-1 text-[11.5px]">
          <b>{comment.author.displayName}</b>
          <NameWithTag name="" role={comment.author.role} title={comment.author.title} size={9.5} />
        </p>
        <p className={`text-[12px] ${comment.deleted ? "italic opacity-70" : ""}`}>{comment.deleted ? t("chat.deletedMessage") : comment.body}</p>
        <div className="mt-1 flex items-center gap-2 text-[10px]">
          {!comment.deleted ? (
            <button type="button" className="muted underline" onClick={onReply}>
              {t("reviews.reply")}
            </button>
          ) : null}
          {comment.canDelete && !comment.deleted ? (
            <button type="button" className="muted underline" onClick={onDelete}>
              {t("common.delete")}
            </button>
          ) : null}
          <span className="muted ml-auto">{formatDateTime(comment.createdAt, "en")}</span>
        </div>
      </div>
    </div>
  );
}

function ReviewPostSheet({
  open,
  onClose,
  onPosted,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onPosted: (pending: boolean) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const { t, toast } = useApp();
  const [kind, setKind] = useState<"SHORTS" | "LONG">("SHORTS");
  const [game, setGame] = useState("Free Fire");
  const [otherGame, setOtherGame] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [media, setMedia] = useState<{ id: string; name: string; kind: string; thumbUrl: string | null; size: number; progress: number }[]>([]);
  const [busy, setBusy] = useState(false);

  const files = useMemo(() => media, [media]);

  const upload = async (fileList: FileList | File[]) => {
    const list = Array.from(fileList);
    if (media.length + list.length > 10) {
      toast(t("reviews.mediaHint"), "error");
      return;
    }
    for (const file of list) {
      const localId = `${file.name}-${Date.now()}`;
      setMedia((prev) => [...prev, { id: localId, name: file.name, kind: file.type.startsWith("video") ? "video" : "image", thumbUrl: null, size: file.size, progress: 10 }]);
      try {
        const prepared = await prepareUpload(file);
        setMedia((prev) => prev.map((entry) => (entry.id === localId ? { ...entry, progress: 55 } : entry)));
        const uploaded = await uploadMedia(file, file.name, prepared);
        setMedia((prev) =>
          prev.map((entry) =>
            entry.id === localId
              ? { ...entry, id: uploaded.id, kind: uploaded.kind, thumbUrl: uploaded.thumbId ? thumbUrl(uploaded) : null, size: uploaded.size, progress: 100 }
              : entry,
          ),
        );
      } catch {
        setMedia((prev) => prev.filter((entry) => entry.id !== localId));
        onError(t("chat.uploadFailed"));
      }
    }
  };

  const submit = async () => {
    if (title.trim().length < 3) {
      onError(t("reviews.titleRequired"));
      return;
    }
    const ids = media.filter((entry) => entry.progress === 100).map((entry) => entry.id);
    if (!ids.length) {
      onError(t("reviews.mediaRequired"));
      return;
    }
    setBusy(true);
    const result = await api<{ status: string }>("/api/reviews", {
      method: "POST",
      body: { action: "create", kind, game: game === "Other" && otherGame.trim() ? otherGame.trim() : game, title: title.trim(), description: description.trim(), mediaIds: ids },
    });
    setBusy(false);
    if (!result.ok) {
      onError(result.data.error === "forbidden" ? t("reviews.notAllowed") : t("common.error"));
      return;
    }
    setTitle("");
    setDescription("");
    setMedia([]);
    await onPosted(result.data.status === "PENDING");
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("reviews.new")}>
      <div className="flex flex-col gap-3">
        <div>
          <span className="label">{t("reviews.type")}</span>
          <div className="flex gap-1.5">
            <button type="button" className={`pill flex-1 text-[12px] ${kind === "SHORTS" ? "pill-active" : ""}`} onClick={() => setKind("SHORTS")}>
              {t("reviews.shorts")}
            </button>
            <button type="button" className={`pill flex-1 text-[12px] ${kind === "LONG" ? "pill-active" : ""}`} onClick={() => setKind("LONG")}>
              {t("reviews.long")}
            </button>
          </div>
        </div>
        <div>
          <span className="label">{t("reviews.game")}</span>
          <div className="flex flex-wrap gap-1.5">
            {["Free Fire", "Minecraft", "Roblox", "Other"].map((value) => (
              <button key={value} type="button" className={`pill text-[12px] ${game === value ? "pill-active" : ""}`} onClick={() => setGame(value)}>
                {value}
              </button>
            ))}
          </div>
          {game === "Other" ? <input className="field mt-2" value={otherGame} onChange={(event) => setOtherGame(event.target.value)} maxLength={30} placeholder={t("reviews.game")} /> : null}
        </div>
        <div>
          <label className="label" htmlFor="review-title">{t("reviews.titleField")}</label>
          <input id="review-title" className="field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="review-desc">{t("reviews.description")}</label>
          <textarea id="review-desc" className="field" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
        </div>
        <div>
          <span className="label">{t("reviews.media")}</span>
          <div className="mb-1.5 grid grid-cols-4 gap-1.5">
            {files.map((entry) => (
              <div key={entry.id} className="relative aspect-square overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)]">
                {entry.thumbUrl ? <img src={entry.thumbUrl} alt="" width={80} height={80} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[9px]">{entry.kind}</span>}
                <button type="button" className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white" onClick={() => setMedia((prev) => prev.filter((item) => item.id !== entry.id))} aria-label={t("common.delete")}>
                  <X size={10} />
                </button>
                {entry.progress < 100 ? <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[8px] text-white">{entry.progress}%</span> : null}
              </div>
            ))}
            {files.length < 10 ? (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-[var(--border)] text-[9px] text-[var(--text-2)]">
                <Plus size={16} /> {t("reviews.addMedia")}
                <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => { if (event.target.files) void upload(event.target.files); event.target.value = ""; }} />
              </label>
            ) : null}
          </div>
          <p className="muted tiny">{t("reviews.mediaHint")}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? <Spinner /> : null} {t("reviews.post")}
        </button>
      </div>
    </Sheet>
  );
}

export function ReviewDetailScreen({ reviewId }: { reviewId: string }) {
  const { t, toast, locale } = useApp();
  const { open: openViewer } = useViewer();
  const router = useRouter();
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ detail: ReviewDetail }>(`/api/reviews?id=${reviewId}`);
    if (result.ok) {
      setDetail(result.data.detail);
      setError(false);
    } else {
      setError(true);
    }
  }, [reviewId]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    const result = await api("/api/reviews", { method: "POST", body: { action: "moderate", reviewId, ...body } });
    setBusy(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    toast(message, "success");
    await load();
  };

  if (error) {
    return (
      <div className="screen pt-6">
        <ErrorState message={t("reviews.loadFailed")} retryLabel={t("common.retry")} onRetry={() => void load()} />
      </div>
    );
  }

  if (!detail) {
    return <div className="screen flex justify-center pt-10"><Spinner size={22} /></div>;
  }

  const filtered = detail.media.filter((item) => !item.expired);

  return (
    <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
      <div className="flex items-center gap-2">
        <Link href="/reviews" className="icon-btn h-9 w-9" aria-label={t("common.back")}>
          <X size={16} />
        </Link>
        <span className="pill cursor-default text-[11.5px]">{detail.kind === "SHORTS" ? t("reviews.shorts") : t("reviews.long")}</span>
        <span className="muted tiny ml-auto">{formatDateShort(detail.createdAt)}</span>
        {detail.pinned ? <Pin size={13} style={{ color: "var(--gold)" }} /> : null}
      </div>

      <div className="g-card p-3">
        <div className="flex items-center gap-2">
          <Avatar name={detail.author.displayName} src={detail.author.avatarUrl} size={34} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1 text-[13px] font-semibold">
              {detail.author.displayName}
              <NameWithTag name="" role={detail.author.role} title={detail.author.title} size={10.5} />
            </p>
            <p className="muted tiny">
              {t("reviews.game")}- <b style={{ color: gameColor(detail.game) }}>{detail.game}</b> · {formatListTime(detail.createdAt, locale, { yesterday: t("common.yesterday") })}
            </p>
          </div>
        </div>
        <h1 className="mt-2 text-[16px] font-semibold leading-snug">{detail.title}</h1>
        {detail.description ? <p className="muted mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed">{detail.description}</p> : null}
        <div className="mt-2 flex items-center gap-1.5">
          {([["LIKE", t("reviews.like"), detail.likeCount, ThumbsUp] as const, ["DISLIKE", t("reviews.dislike"), detail.dislikeCount, ThumbsDown] as const]).map(([value, label, countValue, Icon]) => (
            <button
              key={value}
              type="button"
              className={`pill min-h-[32px] px-2.5 text-[11.5px] ${detail.myReaction === value ? "pill-active" : ""}`}
              onClick={async () => {
                await api("/api/reviews", { method: "POST", body: { action: "react", reviewId, reaction: value } });
                await load();
              }}
            >
              <Icon size={12} /> {label} {countValue}
            </button>
          ))}
          <button type="button" className="pill min-h-[32px] px-2.5 text-[11.5px]" onClick={() => setCommentsOpen(true)}>
            <MessageCircle size={12} /> {detail.commentCount}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {detail.media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            disabled={item.expired}
            onClick={() =>
              openViewer({
                title: detail.title,
                items: detail.media,
                index,
                actions: ["like", "dislike", "comments"],
                onLike: () => void api("/api/reviews", { method: "POST", body: { action: "react", reviewId, reaction: "LIKE" } }).then(load),
                onDislike: () => void api("/api/reviews", { method: "POST", body: { action: "react", reviewId, reaction: "DISLIKE" } }).then(load),
                onComments: () => setCommentsOpen(true),
              })
            }
            className="relative aspect-video overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--card)]"
            aria-label={t("reviews.openViewer")}
          >
            {item.expired ? (
              <span className="flex h-full flex-col items-center justify-center gap-1 text-[9px] text-[var(--text-2)]">
                <Clapperboard size={16} /> {t("reviews.expired")}
              </span>
            ) : (
              <>
                <img src={thumbUrl(item)} alt="" width={200} height={120} loading="lazy" className="h-full w-full object-cover" />
                {item.kind === "video" ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play size={15} fill="white" />
                    </span>
                  </span>
                ) : null}
                {item.kind === "video" ? <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">{formatDuration(item.duration)}</span> : null}
                {item.size ? <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[8px] text-white">{formatBytes(item.size)}</span> : null}
              </>
            )}
          </button>
        ))}
      </div>

      {detail.comments.length ? (
        <div className="g-card p-3">
          <p className="mb-1.5 text-[13px] font-semibold">{t("reviews.commentsTitle")}</p>
          {detail.comments.filter((comment) => !comment.parentId).map((comment) => (
            <div key={comment.id} className="mb-1.5">
              <CommentRow comment={comment} onReply={() => setCommentsOpen(true)} onDelete={async () => {
                await api("/api/reviews", { method: "POST", body: { action: "delete-comment", reviewId, commentId: comment.id } });
                await load();
              }} />
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" className="btn btn-ghost" onClick={() => setCommentsOpen(true)}>
        <MessageCircle size={15} /> {t("reviews.commentsTitle")} ({detail.commentCount})
      </button>

      {detail.canModerate || detail.mine ? (
        <div className="g-card p-3">
          <p className="mb-1.5 text-[12.5px] font-semibold">{t("settings.account")}</p>
          <div className="flex flex-wrap gap-1.5">
            {detail.canModerate ? (
              <>
                <button type="button" className="pill min-h-[32px] px-2.5 text-[11.5px]" disabled={busy} onClick={() => void moderate({ status: detail.status === "APPROVED" ? "HIDDEN" : "APPROVED" }, t("reviews.moderated"))}>
                  {detail.status === "APPROVED" ? t("reviews.hide") : t("reviews.approve")}
                </button>
                <button type="button" className="pill min-h-[32px] px-2.5 text-[11.5px]" disabled={busy} onClick={() => void moderate({ pinned: !detail.pinned }, detail.pinned ? t("reviews.unpin") : t("reviews.pin"))}>
                  <Pin size={12} /> {detail.pinned ? t("reviews.unpin") : t("reviews.pin")}
                </button>
              </>
            ) : null}
            <button type="button" className="pill min-h-[32px] px-2.5 text-[11.5px]" style={{ color: "var(--danger)" }} onClick={() => setDeleteOpen(true)}>
              <Trash2 size={12} /> {t("reviews.delete")}
            </button>
          </div>
        </div>
      ) : null}

      {commentsOpen ? (
        <ReviewCommentsSheet reviewId={reviewId} title={detail.title} onClose={() => setCommentsOpen(false)} onChanged={() => void load()} />
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        title={t("reviews.deleteTitle")}
        body={t("reviews.deleteBody")}
        confirmLabel={t("reviews.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={async () => {
          setDeleteOpen(false);
          const result = await api("/api/reviews", { method: "POST", body: { action: "delete", reviewId } });
          if (!result.ok) {
            toast(t("common.error"), "error");
            return;
          }
          toast(t("reviews.deleted"), "success");
          router.push("/reviews");
        }}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
