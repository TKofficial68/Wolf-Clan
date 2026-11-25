import { api } from "./client";
import type { MediaItem } from "./media-types";

export const MAX_UPLOAD_MB = 50;

export type Prepared = {
  kind: "image" | "video" | "audio" | "voice" | "document";
  width: number | null;
  height: number | null;
  duration: number | null;
  thumb: Blob | null;
};

function baseKind(mime: string): Prepared["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

async function imageMeta(file: File): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image"));
      element.src = url;
    });
    const scale = Math.min(480 / image.naturalWidth, 480 / image.naturalHeight, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(Math.round(image.naturalWidth * scale), 1);
    canvas.height = Math.max(Math.round(image.naturalHeight * scale), 1);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumb = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
    return { kind: "image", width: image.naturalWidth, height: image.naturalHeight, duration: null, thumb };
  } catch {
    return { kind: "image", width: null, height: null, duration: null, thumb: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function videoMeta(file: File): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video"));
    });
    await new Promise<void>((resolve) => {
      const onSeek = () => resolve();
      video.onseeked = onSeek;
      try {
        video.currentTime = Math.min(1, (video.duration || 2) / 2);
      } catch {
        resolve();
      }
      window.setTimeout(resolve, 2500);
    });
    const scale = Math.min(480 / video.videoWidth, 480 / video.videoHeight, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(Math.round(video.videoWidth * scale), 1);
    canvas.height = Math.max(Math.round(video.videoHeight * scale), 1);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumb = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.75));
    return {
      kind: "video",
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      duration: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
      thumb,
    };
  } catch {
    return { kind: "video", width: null, height: null, duration: null, thumb: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function audioMeta(file: File, voice = false): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  try {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    await new Promise<void>((resolve) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => resolve();
      window.setTimeout(resolve, 2500);
    });
    return {
      kind: voice ? "voice" : "audio",
      width: null,
      height: null,
      duration: Number.isFinite(audio.duration) ? Math.round(audio.duration) : null,
      thumb: null,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareUpload(file: File, voice = false): Promise<Prepared> {
  const kind = baseKind(file.type);
  if (kind === "image") return imageMeta(file);
  if (kind === "video") return videoMeta(file);
  if (kind === "audio") return audioMeta(file, voice);
  return { kind: "document", width: null, height: null, duration: null, thumb: null };
}

export async function uploadMedia(
  file: File | Blob,
  name: string,
  meta: Prepared,
  onProgress?: (percent: number) => void,
): Promise<MediaItem> {
  const form = new FormData();
  form.append("file", file instanceof File ? file : new File([file], name, { type: blobType(meta) }));
  form.append("name", name);
  form.append("kind", meta.kind);
  if (meta.width) form.append("width", String(meta.width));
  if (meta.height) form.append("height", String(meta.height));
  if (meta.duration) form.append("duration", String(meta.duration));
  if (meta.thumb) form.append("thumb", new File([meta.thumb], "thumb.webp", { type: meta.thumb.type || "image/webp" }));
  onProgress?.(15);
  const result = await api<MediaItem>("/api/media", { method: "POST", formData: form });
  onProgress?.(100);
  if (!result.ok) throw new Error(result.data.error ?? "upload_failed");
  return result.data;
}

function blobType(meta: Prepared): string {
  if (meta.kind === "image") return "image/jpeg";
  if (meta.kind === "video") return "video/webm";
  if (meta.kind === "voice" || meta.kind === "audio") return "audio/webm";
  return "application/octet-stream";
}

export function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    image: "image",
    video: "video",
    audio: "audio",
    voice: "voice",
    document: "file",
  };
  return map[kind] ?? kind;
}
