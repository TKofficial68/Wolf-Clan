/**
 * Typed surface for the schema used by the app: the Part 1 tables plus the
 * proposed Part 2 additions from MIGRATIONS_PROPOSED.sql.
 * Keep in sync with src/db/schema.ts.
 */
export type Role = "OWNER" | "ADMIN" | "MEMBER";
export type MessageKind = "text" | "image" | "video" | "audio" | "voice" | "document";
export type ReviewStatus = "PENDING" | "APPROVED" | "HIDDEN";
export type ReviewKind = "SHORTS" | "LONG";

export interface Profile {
  id: string;
  email: string;
  username: string;
  display_name: string;
  role: Role;
  title: string | null;
  bio: string | null;
  avatar_upload_id: string | null;
  banner_upload_id: string | null;
  onboarding_completed: boolean;
  online_visibility: "everyone" | "nobody";
  last_seen_visibility: "everyone" | "nobody";
  profile_visibility: "everyone" | "nobody";
  banned_at: string | null;
  ban_reason: string | null;
  created_at: string;
}

export interface UploadRow {
  id: string;
  owner_id: string;
  mime: string;
  byte_size: number;
  original_name: string | null;
  kind: "image" | "video" | "audio" | "voice" | "document" | "thumb";
  width: number | null;
  height: number | null;
  duration: number | null;
  thumb_id: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  accent: string;
  icon: string;
  post_restricted: boolean;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
}

export interface GroupMemberRow {
  group_id: string;
  user_id: string;
  group_role: "MEMBER" | "MODERATOR";
  muted_until: string | null;
  pinned_at: string | null;
  favorited_at: string | null;
  last_read_at: string | null;
  joined_at: string;
}

export interface MessageRow {
  id: string;
  body: string | null;
  kind: MessageKind;
  media_id: string | null;
  client_message_id: string | null;
  reply_to_id: string | null;
  pinned_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
}

export interface DirectMessageRow extends MessageRow {
  conversation_id: string;
  sender_id: string;
  status: "sent" | "delivered" | "read";
  delivered_at: string | null;
  read_at: string | null;
}

export interface GroupMessageRow extends MessageRow {
  group_id: string;
  sender_id: string;
}

export interface ReactionRow {
  message_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  author_id: string;
  kind: ReviewKind;
  game: string;
  title: string;
  description: string;
  status: ReviewStatus;
  pinned: boolean;
  created_at: string;
}

export interface ReviewCommentRow {
  id: string;
  review_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  deleted_at: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: "dm" | "group" | "mention" | "reply" | "reaction" | "review" | "moderation" | "announcement";
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export interface OwnerSettingsRow {
  id: "singleton";
  members_can_post_reviews: boolean;
  review_moderation: boolean;
}

export interface MediaExpiryQueueRow {
  id: string;
  media_id: string;
  expires_at: string;
  processed_at: string | null;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

// ---------------------------------------------------------------- Part 3
export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  status: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED";
  deadline: string | null;
  created_by: string | null;
}
export interface TaskRow {
  id: string;
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  progress: number;
  deadline: string | null;
  project_id: string | null;
  group_id: string | null;
  created_by: string | null;
  completed_at: string | null;
}
export interface MeetingRow {
  id: string;
  title: string;
  description: string;
  host_id: string;
  group_id: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  room_name: string;
  invite_token: string;
  locked: boolean;
  max_screens: number;
}
export interface LeaderboardEntryRow {
  game: "Roblox" | "Minecraft" | "Free Fire";
  user_id: string;
  points: number;
  updated_by: string | null;
  updated_at: string;
}
export interface CapabilityRow {
  user_id?: string;
  role?: string;
  capability: string;
  allowed: boolean;
}
export interface GroupInviteRow {
  id: string;
  code: string;
  token: string;
  group_id: string | null;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  approval_required: boolean;
  revoked_at: string | null;
}
export interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: "message" | "review" | "comment" | "user" | "group";
  target_id: string;
  reason: "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "OTHER";
  detail: string | null;
  status: "OPEN" | "REVIEWING" | "RESOLVED" | "REJECTED";
  moderator_note: string | null;
}
export interface HardDeleteJobRow {
  id: string;
  type: string;
  target_id: string;
  requested_by: string | null;
  status: "RUNNING" | "DONE" | "FAILED";
  message_count: number;
  file_count: number;
  freed_bytes: number;
  progress: number;
  error: string | null;
}
export interface DeletionTombstoneRow {
  id: string;
  type: string;
  target_id: string;
  container: string | null;
  deleted_at: string;
}
export interface CleanupJobRow {
  id: string;
  kind: string;
  dry_run: boolean;
  status: "RUNNING" | "DONE" | "FAILED";
  counts: string | null;
  error: string | null;
}
export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}
