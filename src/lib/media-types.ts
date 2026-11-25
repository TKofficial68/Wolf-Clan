export type MediaItem = {
  id: string;
  thumbId: string | null;
  kind: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  expired: boolean;
  createdAt: string;
  senderName?: string;
  senderId?: string;
};

export type ViewerAction =
  | { type: "reply"; onSelect: () => void }
  | { type: "react"; onSelect: (emoji: string) => void }
  | { type: "like"; onSelect: () => void }
  | { type: "dislike"; onSelect: () => void }
  | { type: "comments"; onSelect: () => void }
  | { type: "delete"; onSelect: () => void }
  | { type: "info" };

export type ViewerContext = {
  title: string;
  items: MediaItem[];
  index: number;
  actions?: ("reply" | "react" | "like" | "dislike" | "comments" | "delete")[];
  onReply?: () => void;
  onReact?: (emoji: string) => void;
  onLike?: () => void;
  onDislike?: () => void;
  onComments?: () => void;
  onDelete?: () => void;
};

export function mediaUrl(id: string): string {
  return `/api/media/${id}`;
}

export function thumbUrl(item: MediaItem): string {
  return `/api/media/${item.thumbId ?? item.id}`;
}

export function downloadUrl(item: MediaItem): string {
  return `/api/media/${item.id}?download=1`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const total = Math.max(Math.round(seconds), 0);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}
