"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Crown,
  Hourglass,
  ImageUp,
  Megaphone,
  MoreHorizontal,
  Pin,
  Search,
  Star,
  Users,
} from "lucide-react";
import type { HomeData, HomeMember } from "@/lib/home-data";
import { formatListTime } from "@/lib/time";
import { api, errorKey } from "@/lib/client";
import { useApp } from "./providers";
import { Avatar, EmptyState, ErrorState, ListSkeleton, NameWithTag, Sheet, Spinner } from "./ui";
import { WolfBannerArt } from "./wolf-art";
import type { MessageKey } from "@/i18n";

function StatusIcon({ status }: { status: string }) {
  if (status === "read") return <CheckCheck size={14} className="dm-status-read" aria-hidden="true" />;
  if (status === "delivered") return <CheckCheck size={14} className="dm-status-sent" aria-hidden="true" />;
  if (status === "sent") return <Check size={14} className="dm-status-sent" aria-hidden="true" />;
  if (status === "sending") return <Clock3 size={14} className="muted" aria-hidden="true" />;
  if (status === "queued") return <Hourglass size={14} className="muted" aria-hidden="true" />;
  if (status === "failed") return <AlertTriangle size={14} style={{ color: "var(--danger)" }} aria-hidden="true" />;
  return null;
}

const MemberRow = memo(function MemberRow({
  member,
  timeLabel,
  onOpen,
  onMenu,
  opening,
  moreLabel,
}: {
  member: HomeMember;
  timeLabel: string;
  onOpen: (member: HomeMember) => void;
  onMenu: (member: HomeMember) => void;
  opening: boolean;
  moreLabel: string;
}) {
  return (
    <div className="g-card-flat relative flex items-center gap-2.5 px-2.5 py-2">
      <button
        type="button"
        onClick={() => onOpen(member)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        aria-label={member.displayName}
      >
        <Avatar name={member.displayName} src={member.avatarUrl} size={42} online={member.online ? true : undefined} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-[15px] font-semibold">{member.displayName}</span>
              <NameWithTag name="" role={member.role} title={member.title} />
            </span>
            <span className="muted tiny flex-none">{timeLabel}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {member.lastMessage ? (
              <>
                {member.lastMessage.mine ? <StatusIcon status={member.lastMessage.status} /> : null}
                <span className="muted truncate text-[12.5px]" style={{ maxWidth: "100%" }}>
                  {member.lastMessage.body}
                </span>
              </>
            ) : (
              <span className="muted text-[12px] italic">—</span>
            )}
            {member.unread > 0 ? <span className="badge ml-auto flex-none">{member.unread}</span> : null}
          </span>
        </span>
      </button>
      {opening ? <Spinner /> : null}
      <button
        type="button"
        onClick={() => onMenu(member)}
        aria-label={moreLabel}
        className="flex h-11 w-8 flex-none items-center justify-center text-[var(--text-2)]"
      >
        <MoreHorizontal size={17} />
      </button>
      <ChevronRight size={18} className="flex-none text-[var(--text-2)]" aria-hidden="true" />
    </div>
  );
});

export function HomeScreen() {
  const { t, locale, toast } = useApp();
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "favorites">("all");
  const [sheetMember, setSheetMember] = useState<HomeMember | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [pull, setPull] = useState(0);
  const pullStart = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [listOffset, setListOffset] = useState(0);

  const load = useCallback(async (quiet = false) => {
    const result = await api<HomeData>("/api/home");
    if (result.ok) {
      setData(result.data);
      setError(false);
    } else if (!quiet) {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 20000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    const update = () => setListOffset(listRef.current?.offsetTop ?? 0);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [data]);

  const filtered = useMemo(() => {
    const members = data?.members ?? [];
    if (filter === "unread") return members.filter((m) => m.unread > 0);
    if (filter === "favorites") return members.filter((m) => m.favorite);
    return members;
  }, [data, filter]);

  const unreadConversations = useMemo(() => (data?.members ?? []).filter((m) => m.unread > 0).length, [data]);
  const favoriteCount = useMemo(() => (data?.members ?? []).filter((m) => m.favorite).length, [data]);

  const virtualizer = useWindowVirtualizer({
    count: filtered.length,
    estimateSize: () => 74,
    overscan: 6,
    scrollMargin: listOffset,
  });

  const openMember = useCallback(
    async (member: HomeMember) => {
      if (openingId) return;
      if (member.blockedByMe || member.blockedMe) {
        toast(t("profile.blockedNotice"), "error");
        return;
      }
      setOpeningId(member.id);
      if (member.conversationId) {
        router.push(`/chat/${member.conversationId}`);
        return;
      }
      const result = await api<{ conversationId: string }>("/api/dm", { method: "POST", body: { userId: member.id } });
      setOpeningId(null);
      if (!result.ok) {
        toast(t(errorKey(result.data.error, "home.chatFailed") as MessageKey), "error");
        return;
      }
      router.push(`/chat/${result.data.conversationId}`);
    },
    [openingId, router, t, toast],
  );

  const updateConversation = useCallback(
    async (member: HomeMember, patch: { pinned?: boolean; favorite?: boolean }) => {
      if (!member.conversationId) {
        toast(t("home.chatFailed"), "error");
        return;
      }
      const result = await api(`/api/dm/${member.conversationId}`, { method: "PATCH", body: patch });
      if (!result.ok) {
        toast(t("home.chatFailed"), "error");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.map((m) =>
                m.id === member.id
                  ? { ...m, pinned: patch.pinned ?? m.pinned, favorite: patch.favorite ?? m.favorite }
                  : m,
              ),
            }
          : prev,
      );
      setSheetMember(null);
      toast(
        patch.pinned !== undefined
          ? patch.pinned
            ? t("home.pinned")
            : t("home.unpinned")
          : patch.favorite
            ? t("home.favorited")
            : t("home.unfavorited"),
        "success",
      );
      void load(true);
    },
    [load, t, toast],
  );

  const uploadBanner = async (file: File) => {
    setBannerBusy(true);
    const form = new FormData();
    form.append("file", file);
    const upload = await api<{ id: string; url: string }>("/api/uploads", { method: "POST", formData: form });
    if (!upload.ok) {
      setBannerBusy(false);
      toast(t("home.bannerFailed"), "error");
      return;
    }
    const saved = await api("/api/profile", { method: "PATCH", body: { bannerUploadId: upload.data.id } });
    setBannerBusy(false);
    if (!saved.ok) {
      toast(t("home.bannerFailed"), "error");
      return;
    }
    setData((prev) => (prev ? { ...prev, bannerUrl: upload.data.url } : prev));
    toast(t("home.bannerUpdated"), "success");
  };

  const onTouchStart = (event: React.TouchEvent) => {
    if (window.scrollY <= 0) pullStart.current = event.touches[0].clientY;
  };
  const onTouchMove = (event: React.TouchEvent) => {
    if (pullStart.current === null) return;
    const delta = event.touches[0].clientY - pullStart.current;
    if (delta > 0 && window.scrollY <= 0) setPull(Math.min(delta * 0.5, 64));
  };
  const onTouchEnd = () => {
    if (pull > 52) void load();
    setPull(0);
    pullStart.current = null;
  };

  const isOwner = data?.me.role === "OWNER";

  return (
    <div
      className="stagger flex flex-col gap-2.5 pb-2"
      style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {pull > 0 ? (
        <div
          className="muted flex items-center justify-center text-[12px]"
          style={{ height: pull, transform: `translateY(${pull > 52 ? -4 : 0}px)` }}
        >
          {t("home.pullHint")}
        </div>
      ) : null}

      {(() => {
        const now = new Date();
        const day = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric" }).format(now));
        const show = day >= 25 && day <= 28;
        return show ? (
          <p className="rounded-[8px] border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.1)] px-2.5 py-1 text-[10.5px]" style={{ color: "var(--warning)" }}>
            {t("meetings.clearBanner")}
          </p>
        ) : null;
      })()}
      <div className="relative overflow-hidden rounded-[20px] p-[1.5px]" style={{ background: "var(--border-grad)" }}>
        <div className="relative overflow-hidden rounded-[18px]" style={{ aspectRatio: "11 / 3", background: "#0A1224" }}>
          {data?.bannerUrl ? (
            <img
              src={data.bannerUrl}
              alt="Wolf Clan banner"
              width={660}
              height={180}
              className="h-full w-full object-cover"
              style={{ objectPosition: "center" }}
            />
          ) : (
            <div className="relative h-full w-full">
              <WolfBannerArt />
              <div className="absolute inset-0 flex flex-col justify-center px-4">
                <span className="brush-title text-[26px] leading-none">Wolf Clan</span>
                <span className="muted mt-1 text-[9.5px] uppercase tracking-[0.16em]">One team. One vision.</span>
              </div>
            </div>
          )}
          {isOwner ? (
            <button
              type="button"
              className="absolute right-1.5 top-1.5 flex h-8 items-center gap-1 rounded-full px-2 text-[10.5px] font-medium"
              style={{ background: "rgba(7,11,18,0.72)", color: "#F8FAFC", border: "1px solid rgba(255,255,255,0.25)" }}
              onClick={() => fileRef.current?.click()}
              disabled={bannerBusy}
              aria-label={t("home.bannerUpdate")}
            >
              <ImageUp size={13} />
              {t("home.bannerUpdate")}
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadBanner(file);
            }}
          />
        </div>
      </div>

      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div style={{ marginTop: -26 }}>
            <Avatar name={data?.me.displayName ?? "W"} src={data?.me.avatarUrl} size={58} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            {data ? (
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-[19px] leading-tight">
                <span className="truncate font-bold">{data.me.displayName}</span>
                <NameWithTag name="" role={data.me.role} title={data.me.title} size={12.5} />
              </p>
            ) : (
              <span className="skeleton block h-4 w-2/3" />
            )}
            <span className="mt-1.5 block h-[2px] w-full rounded" style={{ background: "var(--border-grad)" }} />
          </div>
        </div>
        <Link href="/announcements" className="flex flex-none flex-col items-center gap-1" aria-label={t("home.announcement")}>
          <span
            className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full"
            style={{
              background: "linear-gradient(150deg,#2a1745,#121b29)",
              border: "1.6px solid var(--purple)",
              boxShadow: "0 0 16px rgba(139,77,255,0.35)",
            }}
          >
            <Megaphone size={23} style={{ color: "#F0E7FF" }} />
            {data && data.unreadAnnouncements > 0 ? (
              <span className="badge absolute -right-0.5 -top-0.5">{data.unreadAnnouncements}</span>
            ) : null}
          </span>
          <span
            className="flex h-[22px] w-[124px] items-center justify-center text-[10.5px] font-semibold"
            style={{
              background: "var(--border-grad)",
              clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)",
              color: "#fff",
            }}
          >
            {t("home.announcement")}
          </span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={`pill ${filter === "all" ? "pill-active" : ""}`} onClick={() => setFilter("all")} aria-pressed={filter === "all"}>
          {t("home.all")}
        </button>
        <button
          type="button"
          className={`pill ${filter === "unread" ? "pill-active" : ""}`}
          onClick={() => setFilter("unread")}
          aria-pressed={filter === "unread"}
        >
          {t("home.unread")}
          {unreadConversations > 0 ? <span className="badge absolute -right-1 -top-1.5">{unreadConversations}</span> : null}
        </button>
        <button
          type="button"
          className={`pill ${filter === "favorites" ? "pill-active" : ""}`}
          onClick={() => setFilter("favorites")}
          aria-pressed={filter === "favorites"}
        >
          <Star size={13} fill={filter === "favorites" ? "currentColor" : "none"} />
          {t("home.favorites")}
          {favoriteCount > 0 ? <span className="badge badge-soft">{favoriteCount}</span> : null}
        </button>
        <Link href="/search" className="pill ml-auto min-h-[38px] px-2.5" aria-label={t("common.search")}>
          <Search size={14} />
        </Link>
      </div>

      <div className="hide-scroll flex items-center gap-1.5 overflow-x-auto">
        <span className="pill pointer-events-none min-h-[34px] flex-none px-2.5 text-[11.5px]">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />
          {t("home.onlineCount", { count: data?.counts.online ?? 0 })}
        </span>
        <span className="pill pointer-events-none min-h-[34px] flex-none px-2.5 text-[11.5px]">
          <span className="h-2 w-2 rounded-full" style={{ background: "#ff5c7c" }} />
          {t("home.offlineCount", { count: data?.counts.offline ?? 0 })}
        </span>
        <span className="pill pointer-events-none min-h-[34px] flex-none px-2.5 text-[11.5px]">
          <Users size={13} />
          {t("home.totalUsers", { count: data?.counts.total ?? 0 })}
        </span>
      </div>

      {error && !data ? (
        <ErrorState message={t("common.offline")} retryLabel={t("common.retry")} onRetry={() => void load()} />
      ) : null}

      {!data && !error ? <ListSkeleton rows={5} /> : null}

      {data?.owner ? (
        <button
          type="button"
          onClick={() => void openMember(data.owner!)}
          className="owner-card streak relative flex w-full items-center gap-2.5 rounded-[18px] p-2.5 text-left"
        >
          <Avatar name={data.owner.displayName} src={data.owner.avatarUrl} size={44} online={data.owner.online ? true : undefined} />
          <Crown size={19} style={{ color: "var(--gold)" }} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="truncate text-[17px] font-bold">{data.owner.displayName}</span>
              <NameWithTag name="" role={data.owner.role} title={data.owner.title} size={13} />
            </span>
            {data.owner.unread > 0 ? <span className="badge mt-1 inline-flex">{data.owner.unread}</span> : null}
          </span>
          <ChevronRight size={20} className="flex-none text-[var(--text-2)]" aria-hidden="true" />
        </button>
      ) : null}

      {data && filtered.length === 0 ? (
        filter === "unread" ? (
          <EmptyState icon={<CheckCheck size={22} />} title={t("home.filterEmptyUnread")} body={t("home.filterEmptyUnreadBody")} />
        ) : filter === "favorites" ? (
          <EmptyState icon={<Star size={22} />} title={t("home.filterEmptyFavorites")} body={t("home.filterEmptyFavoritesBody")} />
        ) : (
          <EmptyState icon={<Users size={22} />} title={t("home.emptyTitle")} body={t("home.emptyBody")} />
        )
      ) : null}

      <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const member = filtered[item.index];
          return (
            <div
              key={member.id}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start - listOffset}px)`,
                paddingBottom: 8,
              }}
            >
              <MemberRow
                member={member}
                timeLabel={formatListTime(member.lastMessage?.createdAt ?? null, locale, { yesterday: t("common.yesterday") })}
                onOpen={(m) => void openMember(m)}
                onMenu={setSheetMember}
                opening={openingId === member.id}
                moreLabel={t("home.status")}
              />
            </div>
          );
        })}
      </div>

      <Sheet open={Boolean(sheetMember)} onClose={() => setSheetMember(null)} title={t("home.status")}>
        {sheetMember ? (
          <div className="flex flex-col gap-2">
            <div className="mb-1 flex items-center gap-2.5">
              <Avatar name={sheetMember.displayName} src={sheetMember.avatarUrl} size={38} />
              <NameWithTag name={sheetMember.displayName} role={sheetMember.role} title={sheetMember.title} />
            </div>
            <button
              type="button"
              className="btn btn-ghost justify-start"
              onClick={() => void updateConversation(sheetMember, { pinned: !sheetMember.pinned })}
            >
              <Pin size={16} /> {sheetMember.pinned ? t("home.unpin") : t("home.pin")}
            </button>
            <button
              type="button"
              className="btn btn-ghost justify-start"
              onClick={() => void updateConversation(sheetMember, { favorite: !sheetMember.favorite })}
            >
              <Star size={16} /> {sheetMember.favorite ? t("home.unfavorite") : t("home.favorite")}
            </button>
            <Link href={`/profile/${sheetMember.id}`} className="btn btn-ghost justify-start">
              <Users size={16} /> {t("common.viewProfile")}
            </Link>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
