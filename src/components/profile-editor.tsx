"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, X } from "lucide-react";
import { api, errorKey } from "@/lib/client";
import { useApp } from "./providers";
import { Avatar, ScreenHeader, Sheet, Spinner } from "./ui";
import type { MessageKey } from "@/i18n";

type Initial = {
  displayName: string;
  username: string;
  title: string;
  bio: string;
  avatarUrl: string | null;
};

const VIEW = 280;

export function ProfileEditor({ initial }: { initial: Initial }) {
  const { t, toast } = useApp();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [username, setUsername] = useState(initial.username);
  const [title, setTitle] = useState(initial.title);
  const [bio, setBio] = useState(initial.bio);
  const [avatar, setAvatar] = useState(initial.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imageInfo, setImageInfo] = useState<{ w: number; h: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const clampOffset = (next: { x: number; y: number }, z: number) => {
    if (!imageInfo) return next;
    const cover = Math.max(VIEW / imageInfo.w, VIEW / imageInfo.h);
    const displayW = imageInfo.w * cover * z;
    const displayH = imageInfo.h * cover * z;
    const maxX = Math.max((displayW - VIEW) / 2, 0);
    const maxY = Math.max((displayH - VIEW) / 2, 0);
    return { x: Math.min(Math.max(next.x, -maxX), maxX), y: Math.min(Math.max(next.y, -maxY), maxY) };
  };

  const pickFile = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast(t("profile.avatarType"), "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast(t("profile.avatarTooBig"), "error");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageInfo({ w: img.naturalWidth, h: img.naturalHeight });
      setOffset({ x: 0, y: 0 });
      setZoom(1);
      setImageSrc(objectUrl);
    };
    img.src = objectUrl;
  };

  const saveAvatar = async () => {
    const img = imageRef.current;
    if (!img || !imageInfo) return;
    const cover = Math.max(VIEW / imageInfo.w, VIEW / imageInfo.h);
    const scale = cover * zoom;
    const displayW = imageInfo.w * scale;
    const displayH = imageInfo.h * scale;
    const dx = (VIEW - displayW) / 2 + offset.x;
    const dy = (VIEW - displayH) / 2 + offset.y;
    const size = VIEW / scale;
    const sx = Math.min(Math.max(-dx / scale, 0), imageInfo.w - size);
    const sy = Math.min(Math.max(-dy / scale, 0), imageInfo.h - size);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, size, size, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;
    setBusy(true);
    const form = new FormData();
    form.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    const upload = await api<{ id: string; url: string }>("/api/uploads", { method: "POST", formData: form });
    if (!upload.ok) {
      setBusy(false);
      toast(t("profile.uploadFailed"), "error");
      return;
    }
    const saved = await api("/api/profile", { method: "PATCH", body: { avatarUploadId: upload.data.id } });
    setBusy(false);
    if (!saved.ok) {
      toast(t("profile.uploadFailed"), "error");
      return;
    }
    setAvatar(`${upload.data.url}?v=${Date.now()}`);
    setImageSrc(null);
    toast(t("profile.saved"), "success");
    router.refresh();
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await api("/api/profile", {
      method: "PATCH",
      body: { displayName, username, title, bio },
    });
    setBusy(false);
    if (!result.ok) {
      toast(t(errorKey(result.data.error, "common.error") as MessageKey), "error");
      return;
    }
    toast(t("profile.saved"), "success");
    router.push("/profile");
    router.refresh();
  };

  const cover = imageInfo ? Math.max(VIEW / imageInfo.w, VIEW / imageInfo.h) * zoom : 1;
  const displayW = imageInfo ? imageInfo.w * cover : VIEW;
  const displayH = imageInfo ? imageInfo.h * cover : VIEW;

  return (
    <>
      <ScreenHeader
        title={t("profile.edit")}
        art="/brand/header-profile.webp"
        back={
          <Link href="/profile" className="icon-btn h-9 w-9" aria-label={t("common.back")}>
            <ArrowLeft size={16} />
          </Link>
        }
      />
      <div className="screen" style={{ paddingTop: 14 }}>
        <form className="flex flex-col gap-3" onSubmit={save}>
          <div className="g-card flex flex-col items-center gap-2 p-4">
            <div className="relative">
              <Avatar name={displayName || "W"} src={avatar} size={92} />
              <label
                className="absolute -right-1 bottom-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-white"
                style={{ background: "linear-gradient(140deg,#318BFF,#8B4DFF)", border: "2px solid var(--bg)" }}
              >
                <Camera size={14} />
                <span className="sr-only">{t("profile.changeAvatar")}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) pickFile(file);
                  }}
                />
              </label>
            </div>
            <p className="muted tiny text-center">{t("profile.avatarHint")}</p>
          </div>

          <div className="g-card flex flex-col gap-3 p-3.5">
            <div>
              <label className="label" htmlFor="display-name">{t("profile.displayNameLabel")}</label>
              <input id="display-name" className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} maxLength={32} required />
            </div>
            <div>
              <label className="label" htmlFor="username-field">{t("profile.usernameLabel")}</label>
              <input id="username-field" className="field" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} minLength={3} maxLength={20} pattern="[a-z0-9._]{3,20}" required />
            </div>
            <div>
              <label className="label" htmlFor="title-field">{t("profile.titleLabel")}</label>
              <input id="title-field" className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={24} placeholder="Minecraft Play" />
              <p className="muted tiny mt-1">{t("profile.titleHint")}</p>
            </div>
            <div>
              <label className="label" htmlFor="bio-field">{t("profile.bioLabel")}</label>
              <textarea id="bio-field" className="field" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} rows={4} />
              <p className="muted tiny mt-1">
                {bio.length}/200 · {t("profile.bioHint")}
              </p>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner /> : <Check size={16} />} {t("common.save")}
          </button>
        </form>
      </div>

      <Sheet open={Boolean(imageSrc)} onClose={() => setImageSrc(null)} title={t("profile.crop")}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="relative overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--surface)]"
            style={{ width: VIEW, height: VIEW, touchAction: "none" }}
            onPointerDown={(event) => {
              dragStart.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!dragStart.current) return;
              const next = {
                x: dragStart.current.ox + (event.clientX - dragStart.current.x),
                y: dragStart.current.oy + (event.clientY - dragStart.current.y),
              };
              setOffset(clampOffset(next, zoom));
            }}
            onPointerUp={() => {
              dragStart.current = null;
            }}
          >
            {imageSrc ? (
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  width: displayW,
                  height: displayH,
                  left: (VIEW - displayW) / 2 + offset.x,
                  top: (VIEW - displayH) / 2 + offset.y,
                  maxWidth: "none",
                }}
              />
            ) : null}
            <span className="pointer-events-none absolute inset-0 rounded-[16px] border-2 border-white/70" />
          </div>
          <label className="muted flex w-full items-center gap-2 text-[12px]">
            {t("profile.zoom")}
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(event) => {
                const nextZoom = Number(event.target.value);
                setZoom(nextZoom);
                setOffset((prev) => clampOffset(prev, nextZoom));
              }}
              className="flex-1 accent-[var(--blue)]"
            />
          </label>
          <div className="flex w-full gap-2">
            <button type="button" className="btn btn-ghost flex-1" onClick={() => setImageSrc(null)}>
              <X size={15} /> {t("common.cancel")}
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={() => void saveAvatar()} disabled={busy}>
              {busy ? <Spinner /> : <Check size={15} />} {t("common.save")}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
