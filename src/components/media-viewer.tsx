"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  Lock,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Share2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { formatBytes, formatDuration, isIos, mediaUrl, thumbUrl, type MediaItem, type ViewerContext } from "@/lib/media-types";
import { offline } from "@/lib/offline";
import { useApp } from "./providers";
import { Spinner } from "./ui";

const activeMedia = new Set<HTMLMediaElement>();

function pauseOthers(element: HTMLMediaElement) {
  activeMedia.forEach((media) => {
    if (media !== element) media.pause();
  });
  activeMedia.add(element);
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function MediaViewer({ context, onClose }: { context: ViewerContext; onClose: () => void }) {
  const { t, toast, locale } = useApp();
  const [index, setIndex] = useState(Math.min(Math.max(context.index, 0), Math.max(context.items.length - 1, 0)));
  const [infoOpen, setInfoOpen] = useState(false);
  const item: MediaItem | undefined = context.items[index];
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => {
        const next = current + delta;
        if (next < 0 || next >= context.items.length) return current;
        return next;
      });
    },
    [context.items.length],
  );

  const download = useCallback(
    (target: MediaItem) => {
      const anchor = document.createElement("a");
      anchor.href = `/api/media/${target.id}?download=1`;
      anchor.download = target.name;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast(isIos() ? t("viewer.downloadIos") : t("viewer.downloadStarted"), "info");
    },
    [t, toast],
  );

  const saveToPhotos = useCallback(
    async (target: MediaItem) => {
      if (!isIos()) {
        toast(t("viewer.shareUnavailable"), "info");
        return;
      }
      if (!/^image\/|^video\//.test(target.mime)) {
        toast(t("viewer.shareUnsupportedType"), "info");
        return;
      }
      toast(t("viewer.preparing"), "info");
      try {
        const response = await fetch(mediaUrl(target.id));
        if (!response.ok) throw new Error("fetch");
        const blob = await response.blob();
        const file = new File([blob], target.name, { type: target.mime });
        const shareData = { files: [file] };
        if (navigator.canShare && navigator.canShare(shareData)) {
          await navigator.share(shareData);
        } else {
          toast(t("viewer.largeToFiles"), "info");
          download(target);
        }
      } catch {
        toast(t("viewer.saveFailed"), "error");
      }
    },
    [download, t, toast],
  );

  const share = useCallback(
    async (target: MediaItem) => {
      try {
        const url = new URL(`/api/media/${target.id}`, window.location.origin).toString();
        if (navigator.share) {
          await navigator.share({ title: target.name, url });
        } else {
          await navigator.clipboard.writeText(url);
          toast(t("common.copied"), "success");
        }
      } catch {
        undefined;
      }
    },
    [t, toast],
  );

  useEffect(() => {
    const onArrow = (event: KeyboardEvent) => {
      if (item?.kind === "video" || item?.kind === "audio") return;
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onArrow);
    return () => window.removeEventListener("keydown", onArrow);
  }, [go, item?.kind]);

  const actionButtons = useMemo(() => {
    const actions = context.actions ?? [];
    const list: { key: string; label: string; onClick: () => void; icon?: React.ReactNode }[] = [];
    if (actions.includes("reply") && context.onReply) list.push({ key: "reply", label: t("viewer.reply"), onClick: context.onReply });
    if (actions.includes("like") && context.onLike) list.push({ key: "like", label: t("viewer.like"), onClick: context.onLike });
    if (actions.includes("dislike") && context.onDislike) list.push({ key: "dislike", label: t("viewer.dislike"), onClick: context.onDislike });
    if (actions.includes("comments") && context.onComments) list.push({ key: "comments", label: t("viewer.comments"), onClick: context.onComments });
    if (actions.includes("delete") && context.onDelete) list.push({ key: "delete", label: t("common.delete"), onClick: context.onDelete });
    return list;
  }, [context, t]);

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black text-white transition-opacity duration-200"
      style={{ opacity: started ? 1 : 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={item?.name ?? t("viewer.title")}
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top))]">
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10" aria-label={t("common.close")} onClick={onClose}>
          <X size={19} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{context.title}</p>
          <p className="truncate text-[11px] text-white/60">
            {item?.senderName ? `${item.senderName} · ` : ""}
            {context.items.length > 1 ? `${index + 1} / ${context.items.length}` : (item?.name ?? "")}
          </p>
        </div>
        {context.items.length > 1 ? (
          <div className="flex items-center gap-1">
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 disabled:opacity-30" aria-label={t("viewer.previous")} onClick={() => go(-1)} disabled={index === 0}>
              <ArrowLeft size={17} />
            </button>
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 disabled:opacity-30" aria-label={t("viewer.next")} onClick={() => go(1)} disabled={index === context.items.length - 1}>
              <ArrowRight size={17} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {!item ? null : item.expired ? (
          <ExpiredCard item={item} />
        ) : item.kind === "image" ? (
          <ImageViewer key={item.id} item={item} onNavigate={go} onClose={onClose} />
        ) : item.kind === "video" ? (
          <VideoPlayer key={item.id} item={item} onClose={onClose} onDownload={() => download(item)} />
        ) : item.kind === "audio" || item.kind === "voice" ? (
          <AudioPlayer key={item.id} item={item} onClose={onClose} />
        ) : (
          <DocumentCard item={item} onDownload={() => download(item)} />
        )}
      </div>

      {item && !item.expired ? (
        <div className="px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
          {context.items.length > 1 ? (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 hide-scroll">
              {context.items.map((entry, entryIndex) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setIndex(entryIndex)}
                  className="relative h-12 w-12 flex-none overflow-hidden rounded-[8px] border"
                  style={{ borderColor: entryIndex === index ? "#4FC3FF" : "rgba(255,255,255,0.18)" }}
                  aria-label={`${t("viewer.open")} ${entryIndex + 1}`}
                >
                  {entry.expired ? (
                    <span className="flex h-full w-full items-center justify-center bg-white/10 text-[9px] text-white/70">Expired</span>
                  ) : (
                    <img src={thumbUrl(entry)} alt="" width={48} height={48} loading="lazy" className="h-full w-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-1 overflow-x-auto hide-scroll">
            {actionButtons.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                className="flex h-10 flex-none items-center gap-1 rounded-full bg-white/10 px-3 text-[12px]"
                style={action.key === "delete" ? { color: "#ff8a9c" } : undefined}
              >
                {action.label}
              </button>
            ))}
            {context.actions?.includes("react") && context.onReact ? (
              <div className="flex flex-none items-center gap-0.5 rounded-full bg-white/10 px-1.5">
                {["👍", "❤️", "😂", "😮", "😢", "🔥"].map((emoji) => (
                  <button key={emoji} type="button" className="flex h-9 w-9 items-center justify-center text-[16px]" onClick={() => context.onReact?.(emoji)} aria-label={emoji}>
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={() => download(item)} className="flex h-10 flex-none items-center gap-1 rounded-full bg-white/10 px-3 text-[12px]">
              <Download size={14} /> {t("viewer.download")}
            </button>
            {isIos() && (item.kind === "image" || item.kind === "video") ? (
              <button type="button" onClick={() => void saveToPhotos(item)} className="flex h-10 flex-none items-center gap-1 rounded-full bg-white/10 px-3 text-[12px]">
                <ImageIcon size={14} /> {t("viewer.saveToPhotos")}
              </button>
            ) : null}
            <button type="button" onClick={() => void share(item)} className="flex h-10 flex-none items-center gap-1 rounded-full bg-white/10 px-3 text-[12px]">
              <Share2 size={14} /> {t("viewer.share")}
            </button>
            <button type="button" onClick={() => setInfoOpen(true)} className="flex h-10 flex-none items-center gap-1 rounded-full bg-white/10 px-3 text-[12px]">
              <Info size={14} /> {t("viewer.info")}
            </button>
          </div>
        </div>
      ) : null}

      {infoOpen && item ? (
        <div className="absolute inset-x-0 bottom-0 rounded-t-[18px] bg-[#101722] p-4" style={{ animation: "sheet-in .2s ease-out both" }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[14px] font-semibold">{t("viewer.info")}</p>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10" onClick={() => setInfoOpen(false)} aria-label={t("common.close")}>
              <X size={16} />
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[12px]">
            <div><dt className="text-white/50">{t("viewer.name")}</dt><dd className="break-all">{item.name}</dd></div>
            <div><dt className="text-white/50">{t("viewer.size")}</dt><dd>{formatBytes(item.size)}</dd></div>
            <div><dt className="text-white/50">{t("viewer.type")}</dt><dd>{item.mime}</dd></div>
            <div><dt className="text-white/50">{t("viewer.resolution")}</dt><dd>{item.width && item.height ? `${item.width} × ${item.height}` : "—"}</dd></div>
            <div><dt className="text-white/50">{t("viewer.sender")}</dt><dd>{item.senderName ?? "—"}</dd></div>
            <div><dt className="text-white/50">{t("viewer.sent")}</dt><dd>{new Date(item.createdAt).toLocaleString(locale === "bn" ? "bn-BD" : "en-GB")}</dd></div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function ExpiredCard({ item }: { item: MediaItem }) {
  const { t } = useApp();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-white/10">
        <FileText size={26} />
      </span>
      <p className="text-[15px] font-semibold">{item.name}</p>
      <p className="text-[12px] text-white/60">{formatBytes(item.size)}</p>
      <p className="text-[13px] text-white/80">{t("viewer.expired")}</p>
    </div>
  );
}

function DocumentCard({ item, onDownload }: { item: MediaItem; onDownload: () => void }) {
  const { t } = useApp();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-[16px] bg-white/10">
        <FileText size={34} />
      </span>
      <p className="max-w-[280px] break-all text-[15px] font-semibold">{item.name}</p>
      <p className="text-[12px] text-white/60">
        {item.mime} · {formatBytes(item.size)}
      </p>
      <button type="button" className="mt-2 flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-black" onClick={onDownload}>
        <Download size={16} /> {t("viewer.download")}
      </button>
      {item.mime === "application/pdf" ? (
        <a href={mediaUrl(item.id)} target="_blank" rel="noreferrer" className="text-[12px] text-[#4FC3FF] underline">
          {t("viewer.openInTab")}
        </a>
      ) : null}
    </div>
  );
}

function ImageViewer({ item, onNavigate, onClose }: { item: MediaItem; onNavigate: (delta: number) => void; onClose: () => void }) {
  const { t } = useApp();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const gesture = useRef<{ mode: "none" | "pan" | "pinch" | "swipe"; startX: number; startY: number; dist: number; scale: number; offset: { x: number; y: number } } | null>(null);
  const lastTap = useRef(0);

  const distance = (touches: ArrayLike<{ clientX: number; clientY: number }>) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  return (
    <div
      className="relative flex h-full items-center justify-center overflow-hidden"
      onTouchStart={(event) => {
        if (event.touches.length === 2) {
          gesture.current = { mode: "pinch", startX: 0, startY: 0, dist: distance(event.touches), scale, offset };
        } else if (event.touches.length === 1) {
          gesture.current = {
            mode: scale > 1 ? "pan" : "swipe",
            startX: event.touches[0].clientX,
            startY: event.touches[0].clientY,
            dist: 0,
            scale,
            offset,
          };
        }
      }}
      onTouchMove={(event) => {
        const current = gesture.current;
        if (!current) return;
        if (current.mode === "pinch" && event.touches.length === 2) {
          const nextScale = clamp((current.scale * distance(event.touches)) / current.dist, 1, 5);
          setScale(nextScale);
          if (nextScale === 1) setOffset({ x: 0, y: 0 });
        } else if (current.mode === "pan" && event.touches.length === 1) {
          const dx = event.touches[0].clientX - current.startX;
          const dy = event.touches[0].clientY - current.startY;
          setOffset({ x: current.offset.x + dx, y: current.offset.y + dy });
        }
      }}
      onTouchEnd={(event) => {
        const current = gesture.current;
        gesture.current = null;
        if (!current) return;
        if (current.mode === "swipe" && event.changedTouches.length) {
          const dx = event.changedTouches[0].clientX - current.startX;
          const dy = event.changedTouches[0].clientY - current.startY;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) onNavigate(dx < 0 ? 1 : -1);
          else if (dy > 130) onClose();
        }
      }}
      onDoubleClick={() => {
        setScale((current) => (current > 1 ? 1 : 2.5));
        setOffset({ x: 0, y: 0 });
      }}
      onClick={() => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          setScale((current) => (current > 1 ? 1 : 2.5));
          setOffset({ x: 0, y: 0 });
        }
        lastTap.current = now;
      }}
    >
      {!loaded && !error ? (
        <img src={thumbUrl(item)} alt="" className="absolute max-h-full max-w-full object-contain opacity-60" />
      ) : null}
      {error ? (
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <RotateCcw size={26} />
          <p className="text-[13px] text-white/80">{t("viewer.imageError")}</p>
        </div>
      ) : (
        <img
          src={mediaUrl(item.id)}
          alt={item.name}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transition: gesture.current ? "none" : "transform 0.18s ease-out",
            touchAction: "none",
          }}
        />
      )}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-[10px] text-white/70">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}

function VideoPlayer({ item, onClose, onDownload }: { item: MediaItem; onClose: () => void; onDownload: () => void }) {
  const { t, toast, prefs } = useApp();
  const reduceMotion = prefs.reduceMotion;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{ x: number; y: number; time: number; volume: number; current: number; moved: boolean; mode: "none" | "seek" | "volume" | "down" } | null>({
    x: 0,
    y: 0,
    time: 0,
    volume: 1,
    current: 0,
    moved: false,
    mode: "none",
  });
  const lastTap = useRef<{ at: number; side: "left" | "right" | "center"; seconds: number }>({ at: 0, side: "center", seconds: 0 });

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(item.duration ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [locked, setLocked] = useState(false);
  const [visible, setVisible] = useState(true);
  const [showSpeeds, setShowSpeeds] = useState(false);
  const [remainingMode, setRemainingMode] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(false);
  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const [skipLabel, setSkipLabel] = useState<{ side: "left" | "right"; seconds: number } | null>(null);
  const [holdBadge, setHoldBadge] = useState(false);
  const [volumeHud, setVolumeHud] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [startOver, setStartOver] = useState<{ position: number } | null>(null);
  const ios = isIos();
  const hd = (item.height ?? 0) >= 720;
  const unsupported = /matroska|x-mkv/i.test(item.mime) || /\.mkv$/i.test(item.name);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    void offline.getPlayback(item.id).then((position) => {
      if (position && position > 3) {
        video.currentTime = position;
        setTime(position);
        setStartOver({ position });
      }
    });
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.name,
        artist: item.senderName ?? "Wolf Clan",
        artwork: [{ src: thumbUrl(item), sizes: "480x480", type: "image/jpeg" }],
      });
      navigator.mediaSession.setActionHandler("play", () => void video.play());
      navigator.mediaSession.setActionHandler("pause", () => video.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => skip(-10));
      navigator.mediaSession.setActionHandler("seekforward", () => skip(10));
    }
    return () => {
      const position = video.currentTime;
      if (position > 0 && position < (video.duration || duration) - 2) void offline.savePlayback(item.id, position);
      activeMedia.delete(video);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const showControls = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) setVisible(false);
    }, 3000);
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video || error) return;
    if (video.paused) {
      void video.play();
      setPlaying(true);
      showControls();
    } else {
      video.pause();
      setPlaying(false);
      setVisible(true);
    }
  }, [error, showControls]);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.min(Math.max(video.currentTime + seconds, 0), video.duration || 0);
    video.currentTime = next;
    setTime(next);
  }, []);

  const accumulateSkip = (side: "left" | "right") => {
    const now = Date.now();
    const seconds = lastTap.current.at && now - lastTap.current.at < 700 && lastTap.current.side === side ? lastTap.current.seconds + 10 : 10;
    lastTap.current = { at: now, side, seconds };
    skip(side === "left" ? -10 : 10);
    setSkipLabel({ side, seconds });
    window.setTimeout(() => setSkipLabel(null), 700);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      if (["INPUT", "TEXTAREA"].includes((event.target as HTMLElement | null)?.tagName ?? "")) return;
      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();
          toggle();
          break;
        case "j":
          skip(-10);
          break;
        case "l":
          skip(10);
          break;
        case "arrowleft":
          skip(-5);
          break;
        case "arrowright":
          skip(5);
          break;
        case "arrowup":
          video.volume = Math.min(video.volume + 0.1, 1);
          setVolume(video.volume);
          break;
        case "arrowdown":
          video.volume = Math.max(video.volume - 0.1, 0);
          setVolume(video.volume);
          break;
        case "m":
          video.muted = !video.muted;
          setMuted(video.muted);
          break;
        case "f":
          void toggleFullscreen();
          break;
        default:
          if (/^[0-9]$/.test(event.key)) {
            const target = ((video.duration || 0) * Number(event.key)) / 10;
            video.currentTime = target;
            setTime(target);
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, toggle]);

  async function toggleFullscreen() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    try {
      if (!document.fullscreenElement) {
        await wrap.requestFullscreen();
        setFullscreen(true);
        const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
        try {
          await orientation.lock?.("landscape");
        } catch {
          undefined;
        }
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      video?.webkitEnterFullscreen?.();
    }
  }

  if (unsupported || error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <RotateCcw size={26} />
        <p className="text-[14px] font-semibold">{t("viewer.cantPlay")}</p>
        <p className="text-[12px] text-white/60">{t("viewer.cantPlayHint")}</p>
        <button type="button" className="mt-2 flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-black" onClick={onDownload}>
          <Download size={16} /> {t("viewer.download")}
        </button>
        {error ? (
          <button type="button" className="text-[12px] text-[#4FC3FF] underline" onClick={() => { setError(false); setBuffering(true); videoRef.current?.load(); }}>
            {t("common.retry")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full items-center justify-center overflow-hidden bg-black"
      onPointerDown={(event) => {
        if (locked) return;
        gesture.current = { x: event.clientX, y: event.clientY, time: videoRef.current?.currentTime ?? 0, volume, current: videoRef.current?.currentTime ?? 0, moved: false, mode: "none" };
        pressTimer.current = setTimeout(() => {
          const video = videoRef.current;
          if (video && gesture.current && !gesture.current.moved) {
            video.playbackRate = 2;
            setHoldBadge(true);
          }
        }, 480);
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current || locked) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
          current.moved = true;
          if (pressTimer.current) clearTimeout(pressTimer.current);
          setHoldBadge(false);
        }
        const width = wrapRef.current?.clientWidth ?? 320;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 16) {
          current.mode = "seek";
          const durationValue = videoRef.current?.duration ?? duration;
          const preview = Math.min(Math.max(current.current + (dx / width) * durationValue, 0), durationValue);
          setScrubPreview(preview);
        } else if (!ios && Math.abs(dy) > 20 && event.clientX > width * 0.72) {
          current.mode = "volume";
          const next = Math.min(Math.max(current.volume - dy / 300, 0), 1);
          if (videoRef.current) videoRef.current.volume = next;
          setVolume(next);
          setVolumeHud(next);
        } else if (dy > 90) {
          current.mode = "down";
        }
      }}
      onPointerUp={(event) => {
        const current = gesture.current;
        if (pressTimer.current) clearTimeout(pressTimer.current);
        if (holdBadge) {
          setHoldBadge(false);
          if (videoRef.current) videoRef.current.playbackRate = speed;
          gesture.current = null;
          return;
        }
        if (!current) return;
        if (current.mode === "seek" && scrubPreview !== null) {
          if (videoRef.current) videoRef.current.currentTime = scrubPreview;
          setTime(scrubPreview);
          setScrubPreview(null);
          gesture.current = null;
          return;
        }
        if (current.mode === "volume") {
          setVolumeHud(null);
          gesture.current = null;
          return;
        }
        if (current.mode === "down") {
          if (wrapRef.current) wrapRef.current.style.transform = "";
          onClose();
          return;
        }
        if (!current.moved) {
          const width = wrapRef.current?.clientWidth ?? 320;
          const x = event.clientX;
          const side: "left" | "right" | "center" = x < width * 0.3 ? "left" : x > width * 0.7 ? "right" : "center";
          if (side === "center") {
            if (tapTimer.current) clearTimeout(tapTimer.current);
            tapTimer.current = setTimeout(() => {
              setVisible((value) => !value);
            }, 220);
          } else {
            accumulateSkip(side);
          }
        }
        gesture.current = null;
      }}
    >
      <video
        ref={videoRef}
        src={mediaUrl(item.id)}
        poster={thumbUrl(item)}
        playsInline
        preload="metadata"
        className="max-h-full max-w-full"
        style={{ objectFit: fit, width: "100%", height: "100%" }}
        onPlay={() => {
          setPlaying(true);
          if (videoRef.current) pauseOthers(videoRef.current);
          showControls();
        }}
        onPause={() => {
          setPlaying(false);
          setVisible(true);
        }}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || item.duration || 0);
          setBuffering(false);
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onProgress={(event) => {
          const video = event.currentTarget;
          if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1));
        }}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
        loop={loop}
        muted={muted}
      />

      {buffering && !error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50">
            <Spinner size={20} />
          </span>
        </div>
      ) : null}

      {!playing && !buffering ? (
        <button type="button" onClick={toggle} aria-label={t("viewer.play")} className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55" style={{ animation: reduceMotion ? "none" : "fade-up .2s ease-out" }}>
            <Play size={26} fill="white" />
          </span>
        </button>
      ) : null}

      {skipLabel ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="absolute inset-y-0 w-1/2 bg-white/10"
            style={{ [skipLabel.side === "left" ? "right" : "left"]: "50%", animation: reduceMotion ? "none" : "fade-up .25s ease-out" }}
          />
          <span className="rounded-full bg-black/60 px-3 py-1.5 text-[13px] font-semibold">{skipLabel.seconds} s</span>
        </div>
      ) : null}

      {holdBadge ? <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[12px]">2×</div> : null}
      {scrubPreview !== null ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[10px] bg-black/75 px-3 py-2 text-[16px] font-semibold">
          {formatDuration(scrubPreview)}
        </div>
      ) : null}
      {volumeHud !== null ? (
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/70 px-2 py-3">
          <div className="h-24 w-1.5 overflow-hidden rounded-full bg-white/25">
            <div className="w-full bg-white" style={{ height: `${volumeHud * 100}%`, marginTop: `${(1 - volumeHud) * 100}%` }} />
          </div>
        </div>
      ) : null}

      {hd && !visible ? <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold">HD</span> : null}

      {locked ? (
        <button
          type="button"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-4 py-2 text-[12px]"
          onPointerDown={() => {
            pressTimer.current = setTimeout(() => setLocked(false), 800);
          }}
          onPointerUp={() => {
            if (pressTimer.current) clearTimeout(pressTimer.current);
          }}
        >
          <Lock size={14} className="mr-1 inline" /> {t("viewer.holdUnlock")}
        </button>
      ) : (
        <div
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-6 transition-opacity duration-200"
          style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
        >
          <div className="relative mb-1.5 h-6">
            <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded bg-white/25">
              <div className="h-full rounded bg-white/40" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
              <div className="absolute inset-y-0 left-0 rounded bg-[#4FC3FF]" style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
            </div>
            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" style={{ left: `${duration ? (time / duration) * 100 : 0}%` }} />
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={time}
              aria-label={t("viewer.seek")}
              onChange={(event) => {
                const next = Number(event.target.value);
                setTime(next);
                if (videoRef.current) videoRef.current.currentTime = next;
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={toggle} className="flex h-9 w-9 items-center justify-center" aria-label={playing ? t("viewer.pause") : t("viewer.play")}>
              {playing ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
            </button>
            <button type="button" onClick={() => skip(-10)} className="flex h-9 w-9 items-center justify-center" aria-label={t("viewer.back10")}>
              <RotateCcw size={17} />
            </button>
            <button type="button" onClick={() => skip(10)} className="flex h-9 w-9 items-center justify-center" aria-label={t("viewer.forward10")}>
              <RotateCw size={17} />
            </button>
            <button type="button" onClick={() => setRemainingMode((value) => !value)} className="min-w-[74px] text-[11px] tabular-nums" aria-label={t("viewer.time")}>
              {formatDuration(time)} / {remainingMode ? `-${formatDuration(Math.max(duration - time, 0))}` : formatDuration(duration)}
            </button>
            <button
              type="button"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                video.muted = !video.muted;
                setMuted(video.muted);
              }}
              className="flex h-9 w-9 items-center justify-center"
              aria-label={muted ? t("viewer.unmute") : t("viewer.mute")}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            {!ios ? (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label={t("viewer.volume")}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setVolume(next);
                  if (videoRef.current) {
                    videoRef.current.volume = next;
                    videoRef.current.muted = next === 0;
                    setMuted(next === 0);
                  }
                }}
                className="hidden w-16 accent-[#4FC3FF] sm:block"
              />
            ) : null}
            <button type="button" onClick={() => setShowSpeeds((value) => !value)} className="rounded bg-white/15 px-1.5 py-0.5 text-[10.5px] font-semibold" aria-label={t("viewer.speed")}>
              {speed}×
            </button>
            <button type="button" onClick={() => setLoop((value) => !value)} className="flex h-9 w-9 items-center justify-center" style={{ color: loop ? "#4FC3FF" : "white" }} aria-label={t("viewer.loop")}>
              <Repeat size={16} />
            </button>
            <button type="button" onClick={() => setFit(fit === "contain" ? "cover" : "contain")} className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold" aria-label={t("viewer.fit")}>
              {fit === "contain" ? t("viewer.fit") : t("viewer.fill")}
            </button>
            <button type="button" onClick={() => setLocked(true)} className="flex h-9 w-9 items-center justify-center" aria-label={t("viewer.lock")}>
              <Lock size={15} />
            </button>
            {!ios && "pictureInPictureEnabled" in document ? (
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center"
                aria-label={t("viewer.pip")}
                onClick={async () => {
                  try {
                    if (document.pictureInPictureElement) await document.exitPictureInPicture();
                    else await videoRef.current?.requestPictureInPicture();
                  } catch {
                    toast(t("viewer.pipFailed"), "error");
                  }
                }}
              >
                <PictureInPicture2 size={16} />
              </button>
            ) : null}
            <button type="button" onClick={() => void toggleFullscreen()} className="flex h-9 w-9 items-center justify-center" aria-label={t("viewer.fullscreen")}>
              {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            <button type="button" onClick={onDownload} className="flex h-9 w-9 items-center justify-center" aria-label={t("viewer.download")}>
              <Download size={16} />
            </button>
            {hd ? <span className="ml-auto rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">HD</span> : null}
          </div>
        </div>
      )}

      {showSpeeds ? (
        <div className="absolute bottom-16 right-3 flex flex-col rounded-[10px] bg-[#101722] p-1" style={{ animation: "sheet-in .18s ease-out both" }}>
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              className="rounded px-3 py-1.5 text-[12px]"
              style={{ background: speed === value ? "rgba(79,195,255,0.22)" : "transparent" }}
              onClick={() => {
                setSpeed(value);
                setShowSpeeds(false);
                if (videoRef.current) videoRef.current.playbackRate = value;
              }}
            >
              {value}×
            </button>
          ))}
        </div>
      ) : null}

      {startOver ? (
        <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-3 py-1.5 text-[11px]">
          <span>{t("viewer.resumed", { time: formatDuration(startOver.position) })}</span>
          <button
            type="button"
            className="font-semibold text-[#4FC3FF]"
            onClick={() => {
              if (videoRef.current) videoRef.current.currentTime = 0;
              setTime(0);
              void offline.clearPlayback(item.id);
              setStartOver(null);
            }}
          >
            {t("viewer.startOver")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AudioPlayer({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const { t } = useApp();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(item.duration ?? 0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: item.name, artist: item.senderName ?? "Wolf Clan" });
    }
    return () => {
      audio.pause();
      activeMedia.delete(audio);
    };
  }, [item.name, item.senderName]);

  const bars = useMemo(() => Array.from({ length: 48 }, (_, index) => 22 + Math.abs(Math.sin(index * 1.7)) * 66), []);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[13px]">{t("viewer.cantPlay")}</p>
        <a href={`/api/media/${item.id}?download=1`} className="rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-black">
          {t("viewer.download")}
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-white/10">
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused) {
              pauseOthers(audio);
              void audio.play();
            } else audio.pause();
          }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black"
          aria-label={playing ? t("viewer.pause") : t("viewer.play")}
        >
          {playing ? <Pause size={26} fill="black" /> : <Play size={26} fill="black" />}
        </button>
      </div>
      <p className="max-w-[260px] break-all text-center text-[13px]">{item.name}</p>
      <div className="flex h-12 w-full max-w-[320px] items-end gap-[2px]">
        {bars.map((height, index) => {
          const active = duration ? (time / duration) * bars.length > index : false;
          return <span key={index} className="flex-1 rounded-sm" style={{ height: `${height}%`, background: active ? "#4FC3FF" : "rgba(255,255,255,0.28)" }} />;
        })}
      </div>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={time}
        aria-label={t("viewer.seek")}
        onChange={(event) => {
          const next = Number(event.target.value);
          setTime(next);
          if (audioRef.current) audioRef.current.currentTime = next;
        }}
        className="w-full max-w-[320px] accent-[#4FC3FF]"
      />
      <div className="flex w-full max-w-[320px] items-center justify-between text-[11px]">
        <span>{formatDuration(time)}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(time - 10, 0); }} aria-label={t("viewer.back10")}>
            <RotateCcw size={16} />
          </button>
          <button type="button" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(time + 10, duration); }} aria-label={t("viewer.forward10")}>
            <RotateCw size={16} />
          </button>
          <button
            type="button"
            className="rounded bg-white/15 px-1.5 py-0.5 text-[10.5px]"
            onClick={() => {
              const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
              setSpeed(next);
              if (audioRef.current) audioRef.current.playbackRate = next;
            }}
          >
            {speed}×
          </button>
        </div>
        <span>{formatDuration(duration)}</span>
      </div>
      <button type="button" onClick={onClose} className="rounded-full bg-white/10 px-4 py-1.5 text-[11px]">
        {t("common.close")}
      </button>
      <audio
        ref={audioRef}
        src={mediaUrl(item.id)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || item.duration || 0)}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />
    </div>
  );
}
