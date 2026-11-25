import type { MediaItem } from "./media-types";

export type ChatScopeKind = "dm" | "group";

export type ChatSender = {
  id: string;
  displayName: string;
  username: string;
  role: string;
  title: string | null;
  avatarUrl: string | null;
};

export type ChatReaction = { emoji: string; count: number; mine: boolean; names: string[] };

export type ChatMessage = {
  id: string;
  clientMessageId: string | null;
  kind: string;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  mine: boolean;
  pending?: boolean;
  failed?: boolean;
  queued?: boolean;
  status: string;
  sender: ChatSender;
  media: MediaItem | null;
  replyTo: { id: string; senderName: string; preview: string; kind: string } | null;
  reactions: ChatReaction[];
  pinned: boolean;
  readCount: number;
  readBy: { name: string; at: string }[];
};

export type ChatPinned = { id: string; senderName: string; preview: string; kind: string; createdAt: string };

export type ChatMember = ChatSender & {
  online: boolean;
  groupRole: string;
  mutedUntil: string | null;
};

export type ChatPayload = {
  scope: { kind: ChatScopeKind; id: string };
  group: { id: string; name: string; description: string; accent: string; icon: string } | null;
  peer: (ChatSender & { online: boolean; showLastSeen: boolean; lastSeenAt: string | null; blockedByMe: boolean; blockedMe: boolean }) | null;
  members: ChatMember[];
  canPost: boolean;
  postBlockedReason: "restricted" | "muted" | "blocked" | "removed" | null;
  canModerate: boolean;
  canManageGroup: boolean;
  groupRole: string;
  muteUntil: string | null;
  pinned: ChatPinned[];
  messages: ChatMessage[];
  hasMore: boolean;
  firstUnreadId: string | null;
  unreadCount: number;
  typing: string[];
  serverTime: string;
};

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;
