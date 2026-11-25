import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("MEMBER"),
    title: text("title"),
    bio: text("bio"),
    avatarUploadId: uuid("avatar_upload_id"),
    bannerUploadId: uuid("banner_upload_id"),
    emailVerified: boolean("email_verified").notNull().default(false),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    onlineVisibility: text("online_visibility").notNull().default("everyone"),
    lastSeenVisibility: text("last_seen_visibility").notNull().default("everyone"),
    profileVisibility: text("profile_visibility").notNull().default("everyone"),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    banReason: text("ban_reason"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("profiles_email_key").on(sql`lower(${t.email})`), uniqueIndex("profiles_username_key").on(t.username)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("sessions_token_key").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_tokens_hash_key").on(t.tokenHash), index("email_tokens_user_idx").on(t.userId)],
);

export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_attempts_key_idx").on(t.key, t.kind, t.createdAt)],
);

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  byteSize: integer("byte_size").notNull(),
  data: bytea("data").notNull(),
  originalName: text("original_name"),
  kind: text("kind").notNull().default("image"),
  width: integer("width"),
  height: integer("height"),
  duration: numericDuration(),
  thumbId: uuid("thumb_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

function numericDuration() {
  return integer("duration");
}

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  notifyMessages: boolean("notify_messages").notNull().default(true),
  notifyGroups: boolean("notify_groups").notNull().default(true),
  notifyMentions: boolean("notify_mentions").notNull().default(true),
  notifyReplies: boolean("notify_replies").notNull().default(true),
  notifyReactions: boolean("notify_reactions").notNull().default(false),
  notifyTasks: boolean("notify_tasks").notNull().default(true),
  notifyDeadlines: boolean("notify_deadlines").notNull().default(true),
  notifyMeetings: boolean("notify_meetings").notNull().default(true),
  notifyAnnouncements: boolean("notify_announcements").notNull().default(true),
  notifyReviews: boolean("notify_reviews").notNull().default(true),
  sound: boolean("sound").notNull().default(true),
  vibration: boolean("vibration").notNull().default(true),
  messagePreview: boolean("message_preview").notNull().default(true),
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietStart: text("quiet_start").notNull().default("22:00"),
  quietEnd: text("quiet_end").notNull().default("07:00"),
  theme: text("theme").notNull().default("dark"),
  language: text("language").notNull().default("en"),
  animationLevel: text("animation_level").notNull().default("full"),
  reduceMotion: boolean("reduce_motion").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userPresence = pgTable("user_presence", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const directConversations = pgTable(
  "direct_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  },
  (t) => [index("direct_conversations_last_idx").on(t.lastMessageAt)],
);

export const directConversationMembers = pgTable(
  "direct_conversation_members",
  {
    conversationId: uuid("conversation_id").notNull().references(() => directConversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    favoritedAt: timestamp("favorited_at", { withTimezone: true }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dc_members_pk").on(t.conversationId, t.userId), index("dc_members_user_idx").on(t.userId)],
);

export const directMessages = pgTable(
  "direct_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => directConversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    body: text("body"),
    kind: text("kind").notNull().default("text"),
    mediaId: uuid("media_id"),
    clientMessageId: text("client_message_id"),
    replyToId: uuid("reply_to_id"),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by"),
    status: text("status").notNull().default("sent"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("direct_messages_conv_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("direct_messages_client_key").on(t.senderId, t.clientMessageId),
  ],
);

export const directMessageHidden = pgTable(
  "direct_message_hidden",
  {
    messageId: uuid("message_id").notNull().references(() => directMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("direct_message_hidden_pk").on(t.messageId, t.userId)],
);

export const directMessageReactions = pgTable(
  "direct_message_reactions",
  {
    messageId: uuid("message_id").notNull().references(() => directMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    reaction: text("reaction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("direct_message_reactions_pk").on(t.messageId, t.userId)],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    accent: text("accent").notNull().default("blue"),
    icon: text("icon").notNull().default("meeting"),
    postRestricted: boolean("post_restricted").notNull().default(false),
    isSystem: boolean("is_system").notNull().default(false),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("groups_slug_key").on(t.slug)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    groupRole: text("group_role").notNull().default("MEMBER"),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    favoritedAt: timestamp("favorited_at", { withTimezone: true }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    addedBy: uuid("added_by"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_members_pk").on(t.groupId, t.userId), index("group_members_user_idx").on(t.userId)],
);

export const groupMessages = pgTable(
  "group_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    body: text("body"),
    kind: text("kind").notNull().default("text"),
    mediaId: uuid("media_id"),
    clientMessageId: text("client_message_id"),
    replyToId: uuid("reply_to_id"),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("group_messages_group_idx").on(t.groupId, t.createdAt),
    uniqueIndex("group_messages_client_key").on(t.senderId, t.clientMessageId),
  ],
);

export const groupMessageReactions = pgTable(
  "group_message_reactions",
  {
    messageId: uuid("message_id").notNull().references(() => groupMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    reaction: text("reaction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_message_reactions_pk").on(t.messageId, t.userId)],
);

export const groupMessageReads = pgTable(
  "group_message_reads",
  {
    messageId: uuid("message_id").notNull().references(() => groupMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_message_reads_pk").on(t.messageId, t.userId)],
);

export const typingStates = pgTable(
  "typing_states",
  {
    key: text("key").notNull(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("typing_states_pk").on(t.key, t.userId)],
);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    imageUploadId: uuid("image_upload_id"),
    authorId: uuid("author_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_created_idx").on(t.createdAt)],
);

export const announcementReads = pgTable(
  "announcement_reads",
  {
    announcementId: uuid("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("announcement_reads_pk").on(t.announcementId, t.userId)],
);

export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: uuid("blocker_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_blocks_pk").on(t.blockerId, t.blockedId)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("SHORTS"),
    game: text("game").notNull().default("Other"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("APPROVED"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_created_idx").on(t.createdAt)],
);

export const reviewMedia = pgTable(
  "review_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").notNull(),
    kind: text("kind").notNull().default("image"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("review_media_review_idx").on(t.reviewId)],
);

export const reviewReactions = pgTable(
  "review_reactions",
  {
    reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    reaction: text("reaction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("review_reactions_pk").on(t.reviewId, t.userId)],
);

export const reviewComments = pgTable(
  "review_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    body: text("body").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_comments_review_idx").on(t.reviewId, t.createdAt)],
);

export const reviewReads = pgTable(
  "review_reads",
  {
    reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("review_reads_pk").on(t.reviewId, t.userId)],
);

export const mediaExpiryQueue = pgTable(
  "media_expiry_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_expiry_queue_expires_idx").on(t.expiresAt)],
);

export const ownerSettings = pgTable("owner_settings", {
  id: text("id").primaryKey().default("singleton"),
  membersCanPostReviews: boolean("members_can_post_reviews").notNull().default(true),
  reviewModeration: boolean("review_moderation").notNull().default(true),
  registrationMode: text("registration_mode").notNull().default("open"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sign-ups that wait for an Owner decision. Kept out of profiles so it can never be self-edited. */
export const teamApprovals = pgTable(
  "team_approvals",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => profiles.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("team_approvals_status_idx").on(t.status)],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderId: uuid("sender_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  delivery: text("delivery").notNull(),
  deliveryDetail: text("delivery_detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type Group = typeof groups.$inferSelect;

// ---------------------------------------------------------------- Part 3

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("PLANNING"),
    deadline: timestamp("deadline", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("projects_name_key").on(t.name)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("project_members_pk").on(t.projectId, t.userId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    priority: text("priority").notNull().default("MEDIUM"),
    status: text("status").notNull().default("PENDING"),
    progress: integer("progress").notNull().default(0),
    deadline: timestamp("deadline", { withTimezone: true }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_status_idx").on(t.status), index("tasks_deadline_idx").on(t.deadline)],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    progress: integer("progress").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("task_assignees_pk").on(t.taskId, t.userId)],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    mediaId: uuid("media_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_comments_task_idx").on(t.taskId, t.createdAt)],
);

export const taskActivity = pgTable(
  "task_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_activity_task_idx").on(t.taskId, t.createdAt)],
);

export const taskReminders = pgTable(
  "task_reminders",
  {
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("task_reminders_pk").on(t.taskId, t.userId, t.kind)],
);

export const projectActivity = pgTable(
  "project_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_activity_project_idx").on(t.projectId, t.createdAt)],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    hostId: uuid("host_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status").notNull().default("SCHEDULED"),
    roomName: text("room_name").notNull(),
    inviteToken: text("invite_token").notNull(),
    locked: boolean("locked").notNull().default(false),
    maxScreens: integer("max_screens").notNull().default(2),
    screenShareCount: integer("screen_share_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("meetings_token_key").on(t.inviteToken)],
);

export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("meeting_participants_pk").on(t.meetingId, t.userId)],
);

export const meetingSessions = pgTable("meeting_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  peakParticipants: integer("peak_participants").notNull().default(0),
});

export const screenShareClaims = pgTable(
  "screen_share_claims",
  {
    meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("screen_share_claims_pk").on(t.meetingId, t.userId)],
);

export const leaderboardEntries = pgTable(
  "leaderboard_entries",
  {
    game: text("game").notNull(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    points: integer("points").notNull().default(0),
    updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("leaderboard_entries_pk").on(t.game, t.userId), index("leaderboard_points_idx").on(t.game, t.points)],
);

export const leaderboardHistory = pgTable(
  "leaderboard_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    game: text("game").notNull(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    pointsAfter: integer("points_after").notNull(),
    reason: text("reason").notNull(),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leaderboard_history_idx").on(t.createdAt)],
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    allowed: boolean("allowed").notNull().default(true),
    updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_permissions_pk").on(t.userId, t.capability)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: text("role").notNull(),
    capability: text("capability").notNull(),
    allowed: boolean("allowed").notNull().default(true),
  },
  (t) => [uniqueIndex("role_permissions_pk").on(t.role, t.capability)],
);

export const groupInvites = pgTable(
  "group_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    token: text("token").notNull(),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    approvalRequired: boolean("approval_required").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_invites_code_key").on(t.code), uniqueIndex("group_invites_token_key").on(t.token)],
);

export const joinRequests = pgTable(
  "join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviteId: uuid("invite_id").references(() => groupInvites.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => profiles.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("join_requests_status_idx").on(t.status)],
);

export const branding = pgTable("branding", {
  id: text("id").primaryKey().default("singleton"),
  appName: text("app_name").notNull().default("Wolf Clan"),
  tagline: text("tagline").notNull().default("One team. One vision."),
  logoMediaId: uuid("logo_media_id"),
  bannerMediaId: uuid("banner_media_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    detail: text("detail"),
    snapshot: text("snapshot"),
    status: text("status").notNull().default("OPEN"),
    moderatorNote: text("moderator_note"),
    resolvedBy: uuid("resolved_by").references(() => profiles.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_status_idx").on(t.status)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

export const bans = pgTable("bans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  reason: text("reason").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  bannedBy: uuid("banned_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  liftedAt: timestamp("lifted_at", { withTimezone: true }),
});

export const hardDeleteJobs = pgTable("hard_delete_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  targetId: text("target_id").notNull(),
  requestedBy: uuid("requested_by").references(() => profiles.id, { onDelete: "set null" }),
  status: text("status").notNull().default("RUNNING"),
  messageCount: integer("message_count").notNull().default(0),
  fileCount: integer("file_count").notNull().default(0),
  freedBytes: integer("freed_bytes").notNull().default(0),
  progress: integer("progress").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const deletionTombstones = pgTable(
  "deletion_tombstones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    targetId: text("target_id").notNull(),
    container: text("container"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deletion_tombstones_deleted_idx").on(t.deletedAt)],
);

export const cleanupJobs = pgTable("cleanup_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  dryRun: boolean("dry_run").notNull().default(false),
  status: text("status").notNull().default("RUNNING"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  counts: text("counts"),
  error: text("error"),
});
