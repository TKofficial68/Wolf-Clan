# Schema report — Wolf Clan (Part 1)

## Environment note (read first)

This sandbox provides **PostgreSQL through Drizzle ORM**, not a hosted Supabase project, and no Supabase
URL/keys exist here. A read-only audit of a remote Supabase project was therefore not possible.
Instead the Part 1 schema was written with `drizzle-orm/pg-core` in `src/db/schema.ts`, reviewed as a
migration, and applied with `drizzle-kit push` to the sandbox database. The data model maps one-to-one
to the table names below, so it can be moved to Supabase without reshaping features.
Server-side permission checks are implemented in every route handler. Row level security must be added
when the app is deployed to Supabase (proposal in section 6).

## 1. Tables and columns

### profiles
`id uuid pk default gen_random_uuid()` · `email text not null` (unique, case-insensitive index) ·
`password_hash text not null` · `username text not null` (unique) · `display_name text not null` ·
`role text not null default 'MEMBER'` (`OWNER | ADMIN | MEMBER`) · `title text` (optional label such as
Editor or Manager) · `bio text` · `avatar_upload_id uuid` · `banner_upload_id uuid` ·
`email_verified boolean not null default false` · `onboarding_completed boolean not null default false` ·
`online_visibility text default 'everyone'` · `last_seen_visibility text default 'everyone'` ·
`profile_visibility text default 'everyone'` · `banned_at timestamptz` · `ban_reason text` ·
`last_seen_at timestamptz` · `created_at timestamptz` · `updated_at timestamptz`.
Indexes: unique lower(email), unique username.

### sessions
`id`, `user_id → profiles(id) on delete cascade`, `token_hash` (unique), `user_agent`, `ip`,
`created_at`, `last_used_at`, `expires_at`, `revoked_at`. Index on `user_id`.

### email_tokens
`id`, `user_id → profiles`, `kind ('verify'|'reset')`, `token_hash` (unique), `expires_at`, `used_at`,
`created_at`. Index on `user_id`.

### auth_attempts
`id`, `key`, `kind`, `created_at`. Index on `(key, kind, created_at)` — used for login/register/forgot/contact rate limits.

### uploads (Storage substitute)
`id`, `owner_id → profiles`, `mime`, `byte_size`, `data bytea`, `created_at`.
Served by `/api/uploads/[id]` with immutable caching. Replaces the `avatars` bucket in this sandbox.

### user_settings
`user_id pk → profiles`, push and notification toggles (`push_enabled`, `notify_messages`, `notify_groups`,
`notify_mentions`, `notify_replies`, `notify_reactions`, `notify_tasks`, `notify_deadlines`, `notify_meetings`,
`notify_announcements`, `notify_reviews`, `sound`, `vibration`, `message_preview`, `quiet_hours_enabled`,
`quiet_start`, `quiet_end`, `theme`, `language`, `animation_level`, `reduce_motion`, `updated_at`).

### user_presence
`user_id pk → profiles`, `status ('online'|'offline')`, `last_seen_at`, `updated_at`. Heartbeat every 25 s;
online = status online and last_seen within 90 s.

### direct_conversations / direct_conversation_members / direct_messages
- conversations: `id`, `created_at`, `last_message_at` (indexed).
- members: `(conversation_id, user_id)` unique, `pinned_at`, `favorited_at`, `last_read_at`, `joined_at`.
- messages: `id`, `conversation_id`, `sender_id`, `body`, `status ('sent'|'delivered'|'read')`, `created_at`, `read_at`.

### announcements / announcement_reads
- announcements: `id`, `title`, `body`, `image_upload_id`, `author_id → profiles`, `pinned`, `created_at`, `updated_at`.
- reads: `(announcement_id, user_id)` unique, `read_at`.

### user_blocks
`(blocker_id, blocked_id)` unique, `created_at`. Blocked users cannot open or create a DM either way.

### notifications
`id`, `user_id`, `kind`, `title`, `body`, `href`, `read_at`, `created_at`. Announcement publishing writes real rows now; the
Notifications screen is a listed scaffold until Part 2.

### contact_messages
`id`, `sender_id`, `recipient ('developer'|'owner')`, `recipient_email` (server-side only), `subject`, `body`,
`delivery ('sent'|'failed'|'not_configured')`, `delivery_detail`, `created_at`.

## 2. Feature → table/column → exists?

| Feature | Table/column | Exists |
| --- | --- | --- |
| Email + password auth | profiles.password_hash, sessions | yes |
| Username uniqueness | profiles.username unique | yes |
| Email verification | profiles.email_verified, email_tokens(kind=verify) | yes |
| Password reset | email_tokens(kind=reset) | yes |
| Banned screen | profiles.banned_at, ban_reason | yes |
| Tutorial once per account | profiles.onboarding_completed | yes |
| Role + role title | profiles.role, profiles.title | yes |
| Owner identification | profiles.role = 'OWNER' (no hardcoded email) | yes |
| Home banner | profiles.banner_upload_id (Owner row) + uploads | yes |
| DM list, pins, favorites | direct_conversations, direct_conversation_members | yes |
| Message status icons | direct_messages.status, read_at | yes |
| Unread counts | direct_conversation_members.last_read_at | yes |
| Online/offline counts | user_presence + visibility columns | yes |
| Announcements + pin + reads | announcements, announcement_reads | yes |
| Announcement image | announcements.image_upload_id | yes |
| Announcement notifications | notifications | yes |
| Blocked users | user_blocks | yes |
| Notification settings | user_settings | yes |
| Privacy settings | profiles online/last_seen/profile_visibility | yes |
| Appearance settings | user_settings theme/language/motion | yes |
| Contact developer/owner | contact_messages + server mail | yes |
| Reports, groups, reviews, tasks, projects, meetings | — | no (Parts 2–3) |
| Group invites / join codes | — | no (Part 3) |
| Leaderboard, meeting sessions, game profiles | — | no (Part 3) |
| Message edit/delete-for-me, reactions, attachments | — | no (Part 2) |

## 3. Functions
No database functions are created. All permission logic lives in server route handlers (`src/app/api/**`) and
server components; no `SECURITY DEFINER` objects exist.

## 4. Environment variables

Configured or needed (names only, set them in the hosting dashboard, never in chat):

- `DATABASE_URL` — present in the sandbox.
- `RESEND_API_KEY` — email delivery (verification, password reset, contact emails). Missing right now.
- `MAIL_FROM` — verified sender, defaults to `Wolf Clan <onboarding@resend.dev>`.
- `DEVELOPER_CONTACT_EMAIL` — defaults to the published developer address, server only.
- `OWNER_CONTACT_EMAIL` — server only, never sent to the browser.
- `APP_URL` — public base URL used in email links.
- `OWNER_EMAIL`, `OWNER_PASSWORD` — only used by the one-time owner seed script.

## 5. Owner identification
`profiles.role = 'OWNER'`. The app never checks an email or user id for ownership. If no Owner exists,
the next registered account becomes Owner; the seed script can create it beforehand. Owner rows are never
modified by feature code (only the Owner can edit their own profile or banner).

## 6. Proposed Supabase hardening (not run)
See `MIGRATIONS_PROPOSED.sql`. It enables RLS on every table, adds membership-based policies for DM data,
owner/admin policies for announcements, self-only policies for profiles/settings/sessions, and storage
bucket policies for `avatars` and `team-banner`. Run only after review, in a Supabase project.
