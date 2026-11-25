# Supabase checklist — Part 2

Everything below is written in `MIGRATIONS_PROPOSED.sql`. Nothing has been applied to a live database from this app.

## Tables
Existing: profiles, team_members, direct_conversations, direct_conversation_members, direct_messages, direct_message_reactions,
groups, group_members, group_invites, group_messages, group_message_reactions, group_message_reads, reviews, review_reactions,
tasks, task_assignees, task_comments, projects, project_members, notifications, push_subscriptions, meetings, meeting_sessions,
meeting_participants, user_blocks, user_presence, owner_settings, owner_audit_logs, media_expiry_queue, cleanup_jobs.

Added by this part: groups, group_members, group_messages, group_message_reactions, group_message_reads, typing_states,
direct_message_reactions, direct_message_hidden, reviews, review_media, review_reactions, review_comments, review_reads,
media_expiry_queue, owner_settings (columns members_can_post_reviews, review_moderation), push_subscriptions.

Columns added: direct_messages (kind, media_id, client_message_id, reply_to_id, pinned_at, edited_at, deleted_at, deleted_by, delivered_at),
uploads (original_name, kind, width, height, duration, thumb_id, expires_at).

## Policies / functions
RLS on every table listed above. Helper functions: current_role_name, is_group_member, is_group_moderator, group_can_post,
can_post_reviews, register_media_expiry, purge_expired_media.

## Buckets
- `avatars` public read, owner write/delete, 5 MB limit.
- `branding` public read, Owner write (team banner + logo).
- `temporary-files` private, member read, owner write/delete, no public URL. Chat/review media lives here with
  `{conversation|group|review id}/{yyyy}/{mm}/{uuid}.{ext}`. The app must serve it through short-lived signed URLs
  (Supabase `createSignedUrl`) after a membership check.

## Realtime tables
direct_messages, group_messages, direct_message_reactions, group_message_reactions, group_message_reads, typing_states,
notifications, reviews, review_reactions, review_comments, review_reads, user_presence, group_members.

## Cron jobs
- `wolf-media-expiry` every 5 minutes: `purge_expired_media()` deletes expired temporary files + thumbnails.
- `wolf-housekeeping` daily 03:00: clears stale typing rows and auth attempts older than 7 days.

## Edge functions
- `send-push` — reads `VAPID_PRIVATE_KEY`, collapses by conversation tag, skips quiet hours, honours message preview and
  deletes dead subscriptions (404/410). Trigger on `notifications` insert.
- `on-upload-expiry` — optional; the trigger already registers every temporary upload with the next midnight Asia/Dhaka.

## Env vars (names only)
DATABASE_URL, SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (server only),
RESEND_API_KEY, MAIL_FROM, APP_URL, DEVELOPER_CONTACT_EMAIL, OWNER_CONTACT_EMAIL, VAPID_PUBLIC_KEY,
NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, MAX_UPLOAD_MB, OWNER_EMAIL, OWNER_PASSWORD.

## Needs confirmation
- The real project's Storage file-size limit per plan (the app reads MAX_UPLOAD_MB, default 50).
- Whether existing `reviews` rows use different status values than APPROVED / PENDING / HIDDEN.
- Whether the existing `groups` rows already exist with these slugs (this environment seeds eight default groups).
- Whether `direct_messages.status` already has a delivered value or needs a new column.
- Whether the Owner flag lives in `profiles.role` or `team_members.role` in the live project.

## Part 3 additions
Tables: projects, project_members, tasks, task_assignees, task_comments, task_activity, task_reminders, project_activity,
meetings, meeting_participants, meeting_sessions, screen_share_claims, leaderboard_entries, leaderboard_history,
user_permissions, role_permissions, group_invites, join_requests, branding, reports, audit_logs, bans, hard_delete_jobs,
deletion_tombstones, cleanup_jobs. Columns: `deleting_at` on messages/reviews/groups/tasks/projects/announcements.

Functions: has_capability(text) (SECURITY DEFINER, revoked from anon). Existing helpers keep their grants tightened.

Cron (UTC): temp files 18:00 daily; monthly chat 06:00 on the 28th; reminders every 15 minutes; presence every 2 minutes;
hard-delete retry every 5 minutes; tombstones 18:30 daily; orphans Sundays 19:00. All authenticated with
`Authorization: Bearer <CRON_SECRET>` read from Supabase Vault.

Edge/route workers: `/api/cron/*` (implemented), `/api/livekit/webhook` (implemented, HMAC verified),
`/api/media/[id]` (signed-URL replacement in this deployment).

Needs confirmation: whether the live project already has `tasks` / `projects` / `meetings` with different column names
(the app uses the names in `database.types.ts`); whether Storage allows 50 MB uploads on your plan; whether
`group_invites` should be scoped to the whole team instead of one group.
