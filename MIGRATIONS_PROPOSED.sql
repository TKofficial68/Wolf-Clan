-- Proposed only. Do not run in this sandbox.
-- Target: Supabase deployment where auth.uid() exists and profiles.id references auth.users(id).

alter table profiles enable row level security;
alter table sessions enable row level security;
alter table email_tokens enable row level security;
alter table auth_attempts enable row level security;
alter table uploads enable row level security;
alter table user_settings enable row level security;
alter table user_presence enable row level security;
alter table direct_conversations enable row level security;
alter table direct_conversation_members enable row level security;
alter table direct_messages enable row level security;
alter table announcements enable row level security;
alter table announcement_reads enable row level security;
alter table user_blocks enable row level security;
alter table notifications enable row level security;
alter table contact_messages enable row level security;

create or replace function current_role_name() returns text language sql stable as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_owner() returns boolean language sql stable as $$
  select coalesce(current_role_name() = 'OWNER', false);
$$;

create policy profiles_read on profiles for select using (
  id = auth.uid() or profile_visibility = 'everyone'
);
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on profiles for insert with check (id = auth.uid());

create policy settings_self on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_self on sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy presence_self on user_presence for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy uploads_self on uploads for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy conversations_member on direct_conversations for select using (
  exists (select 1 from direct_conversation_members m where m.conversation_id = id and m.user_id = auth.uid())
);
create policy dc_members_member on direct_conversation_members for select using (
  exists (
    select 1 from direct_conversation_members mine
    where mine.conversation_id = direct_conversation_members.conversation_id and mine.user_id = auth.uid()
  )
);
create policy dc_members_update_self on direct_conversation_members for update using (user_id = auth.uid());

create policy messages_member_read on direct_messages for select using (
  exists (select 1 from direct_conversation_members m where m.conversation_id = direct_messages.conversation_id and m.user_id = auth.uid())
);
create policy messages_member_insert on direct_messages for insert with check (
  sender_id = auth.uid()
  and exists (select 1 from direct_conversation_members m where m.conversation_id = direct_messages.conversation_id and m.user_id = auth.uid())
  and not exists (select 1 from user_blocks b where b.blocker_id <> auth.uid() and b.blocked_id = auth.uid())
);

create policy announcements_read on announcements for select using (true);
create policy announcements_write on announcements for all using (is_owner() or current_role_name() = 'ADMIN');
create policy announcement_reads_self on announcement_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy blocks_self on user_blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy notifications_self on notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy contact_insert_self on contact_messages for insert with check (sender_id = auth.uid());
create policy contact_read_owner on contact_messages for select using (is_owner());

-- Storage buckets: avatars (public read, owner write) and team-banner (Owner write, public read).
-- insert into storage.buckets (id, name, public) values ('avatars','avatars',true), ('team-banner','team-banner',true)
-- on conflict do nothing;

-- ============================================================================
-- PART 2 additions. Review before running. Dependency order matters.
-- ============================================================================

-- 1. Message columns (DM) + media metadata -----------------------------------
alter table direct_messages
  add column if not exists kind text not null default 'text',
  add column if not exists media_id uuid,
  add column if not exists client_message_id text,
  add column if not exists reply_to_id uuid,
  add column if not exists pinned_at timestamptz,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists delivered_at timestamptz;
create unique index if not exists direct_messages_client_key on direct_messages (sender_id, client_message_id);

alter table uploads
  add column if not exists original_name text,
  add column if not exists kind text not null default 'image',
  add column if not exists width int,
  add column if not exists height int,
  add column if not exists duration int,
  add column if not exists thumb_id uuid,
  add column if not exists expires_at timestamptz;

-- 2. Groups -------------------------------------------------------------------
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  accent text not null default 'blue',
  icon text not null default 'meeting',
  post_restricted boolean not null default false,
  is_system boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  group_role text not null default 'MEMBER',
  muted_until timestamptz,
  pinned_at timestamptz,
  favorited_at timestamptz,
  last_read_at timestamptz,
  added_by uuid,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on group_members (user_id);

create table if not exists group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text,
  kind text not null default 'text',
  media_id uuid,
  client_message_id text,
  reply_to_id uuid,
  pinned_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group_idx on group_messages (group_id, created_at desc);
create unique index if not exists group_messages_client_key on group_messages (sender_id, client_message_id);

create table if not exists group_message_reactions (
  message_id uuid not null references group_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists group_message_reads (
  message_id uuid not null references group_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists direct_message_reactions (
  message_id uuid not null references direct_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists direct_message_hidden (
  message_id uuid not null references direct_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists typing_states (
  key text not null,
  user_id uuid not null references profiles(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (key, user_id)
);

-- 3. Reviews -------------------------------------------------------------------
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'SHORTS',
  game text not null default 'Other',
  title text not null,
  description text not null default '',
  status text not null default 'APPROVED',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reviews_created_idx on reviews (created_at desc);

create table if not exists review_media (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  media_id uuid not null,
  kind text not null default 'image',
  position int not null default 0
);
create index if not exists review_media_review_idx on review_media (review_id);

create table if not exists review_reactions (
  review_id uuid not null references reviews(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table if not exists review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  parent_id uuid references review_comments(id) on delete cascade,
  body text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists review_comments_review_idx on review_comments (review_id, created_at);

create table if not exists review_reads (
  review_id uuid not null references reviews(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table if not exists media_expiry_queue (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null unique,
  expires_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists media_expiry_queue_expires_idx on media_expiry_queue (expires_at);

create table if not exists owner_settings (
  id text primary key default 'singleton',
  members_can_post_reviews boolean not null default true,
  review_moderation boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

-- 4. RLS ----------------------------------------------------------------------
alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_messages enable row level security;
alter table group_message_reactions enable row level security;
alter table group_message_reads enable row level security;
alter table direct_message_reactions enable row level security;
alter table direct_message_hidden enable row level security;
alter table typing_states enable row level security;
alter table reviews enable row level security;
alter table review_media enable row level security;
alter table review_reactions enable row level security;
alter table review_comments enable row level security;
alter table review_reads enable row level security;
alter table media_expiry_queue enable row level security;
alter table owner_settings enable row level security;
alter table push_subscriptions enable row level security;

create or replace function is_group_member(gid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members m where m.group_id = gid and m.user_id = auth.uid());
$$;
create or replace function is_group_moderator(gid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members m
    where m.group_id = gid and m.user_id = auth.uid() and m.group_role = 'MODERATOR'
  ) or current_role_name() in ('OWNER','ADMIN');
$$;
create or replace function group_can_post(gid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members m join groups g on g.id = m.group_id
    where m.group_id = gid and m.user_id = auth.uid()
      and (m.muted_until is null or m.muted_until < now())
      and (g.post_restricted = false or m.group_role = 'MODERATOR' or current_role_name() in ('OWNER','ADMIN'))
  );
$$;
create or replace function can_post_reviews() returns boolean language sql stable security definer set search_path = public as $$
  select current_role_name() in ('OWNER','ADMIN')
     or coalesce((select members_can_post_reviews from owner_settings where id = 'singleton'), true);
$$;

create policy groups_read on groups for select using (is_group_member(id) or current_role_name() in ('OWNER','ADMIN'));
create policy groups_write on groups for all using (current_role_name() in ('OWNER','ADMIN')) with check (current_role_name() in ('OWNER','ADMIN'));
create policy group_members_read on group_members for select using (is_group_member(group_id));
create policy group_members_manage on group_members for all using (is_group_moderator(group_id)) with check (is_group_moderator(group_id));
create policy group_members_self_update on group_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy group_messages_read on group_messages for select using (is_group_member(group_id));
create policy group_messages_insert on group_messages for insert with check (sender_id = auth.uid() and is_group_member(group_id) and group_can_post(group_id));
create policy group_messages_update on group_messages for update using (
  sender_id = auth.uid() or is_group_moderator(group_id)
);
create policy group_reactions_rw on group_message_reactions for all using (
  exists (select 1 from group_messages gm where gm.id = message_id and is_group_member(gm.group_id))
) with check (user_id = auth.uid());
create policy group_reads_rw on group_message_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy dm_reactions_rw on direct_message_reactions for all using (
  exists (select 1 from direct_messages dm join direct_conversation_members m on m.conversation_id = dm.conversation_id
          where dm.id = message_id and m.user_id = auth.uid())
) with check (user_id = auth.uid());
create policy dm_hidden_self on direct_message_hidden for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy typing_self on typing_states for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_read on reviews for select using (status = 'APPROVED' or author_id = auth.uid() or current_role_name() in ('OWNER','ADMIN'));
create policy reviews_insert on reviews for insert with check (author_id = auth.uid() and can_post_reviews());
create policy reviews_update on reviews for update using (author_id = auth.uid() or current_role_name() in ('OWNER','ADMIN'));
create policy reviews_delete on reviews for delete using (author_id = auth.uid() or current_role_name() in ('OWNER','ADMIN'));
create policy review_media_read on review_media for select using (
  exists (select 1 from reviews r where r.id = review_id and (r.status = 'APPROVED' or r.author_id = auth.uid() or current_role_name() in ('OWNER','ADMIN')))
);
create policy review_media_write on review_media for all using (
  exists (select 1 from reviews r where r.id = review_id and r.author_id = auth.uid())
) with check (true);
create policy review_reactions_rw on review_reactions for all using (true) with check (user_id = auth.uid());
create policy review_comments_read on review_comments for select using (true);
create policy review_comments_insert on review_comments for insert with check (author_id = auth.uid());
create policy review_comments_update on review_comments for update using (author_id = auth.uid() or current_role_name() in ('OWNER','ADMIN'));
create policy review_reads_self on review_reads for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_settings_read on owner_settings for select using (true);
create policy owner_settings_write on owner_settings for all using (current_role_name() = 'OWNER') with check (current_role_name() = 'OWNER');
create policy push_self on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy expiry_service_only on media_expiry_queue for all using (false) with check (false);

-- 5. Storage buckets and policies ---------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars','avatars',true,5242880), ('branding','branding',true,10485760), ('temporary-files','temporary-files',false,null)
on conflict (id) do nothing;

create policy avatars_public_read on storage.objects for select using (bucket_id = 'avatars');
create policy avatars_owner_write on storage.objects for insert with check (bucket_id = 'avatars' and owner = auth.uid());
create policy avatars_owner_delete on storage.objects for delete using (bucket_id = 'avatars' and owner = auth.uid());
create policy branding_public_read on storage.objects for select using (bucket_id = 'branding');
create policy branding_owner_write on storage.objects for insert with check (bucket_id = 'branding' and current_role_name() = 'OWNER');
create policy temporary_member_read on storage.objects for select using (bucket_id = 'temporary-files' and auth.uid() is not null);
create policy temporary_owner_write on storage.objects for insert with check (bucket_id = 'temporary-files' and owner = auth.uid());
create policy temporary_owner_delete on storage.objects for delete using (bucket_id = 'temporary-files' and owner = auth.uid());

-- 6. Realtime -----------------------------------------------------------------
alter publication supabase_realtime add table
  direct_messages, group_messages, direct_message_reactions, group_message_reactions,
  group_message_reads, typing_states, notifications, reviews, review_reactions,
  review_comments, review_reads, user_presence, group_members;

-- 7. Expiry and cleanup jobs (pg_cron runs as the service role) ----------------
create extension if not exists pg_cron;

-- Register expiry whenever a temporary upload is created (server-side only, never trusted from clients).
create or replace function register_media_expiry() returns trigger language plpgsql security definer as $$
begin
  if new.expires_at is not null then
    insert into media_expiry_queue (media_id, expires_at) values (new.id, new.expires_at)
    on conflict (media_id) do update set expires_at = excluded.expires_at;
  end if;
  return new;
end;
$$;
drop trigger if exists uploads_expiry_trigger on uploads;
create trigger uploads_expiry_trigger after insert on uploads for each row execute function register_media_expiry();

-- Delete expired files and their thumbnails once a minute.
create or replace function purge_expired_media() returns void language plpgsql security definer as $$
declare row_record record;
begin
  for row_record in
    select q.media_id, u.thumb_id from media_expiry_queue q
    join uploads u on u.id = q.media_id
    where q.expires_at < now() and q.processed_at is null
    limit 200
  loop
    delete from storage.objects where bucket_id = 'temporary-files' and name like row_record.media_id || '%';
    delete from uploads where id = row_record.media_id or id = row_record.thumb_id;
    update media_expiry_queue set processed_at = now() where media_id = row_record.media_id;
  end loop;
end;
$$;
select cron.schedule('wolf-media-expiry', '*/5 * * * *', $$select purge_expired_media();$$);

-- Nightly trimming of stale typing and auth-attempt rows.
select cron.schedule('wolf-housekeeping', '0 3 * * *', $$
  delete from typing_states where updated_at < now() - interval '1 day';
  delete from auth_attempts where created_at < now() - interval '7 days';
$$);

-- 8. Push notification sender (Edge Function `send-push`, env VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY)
--    Trigger: after insert on notifications -> http POST to the function with the row id.
--    Respects user_settings quiet_hours_enabled/quiet_start/quiet_end, per-category toggles
--    and message_preview; removes subscriptions answering 404/410.

-- ============================================================================
-- PART 3 additions. Review before running. Dependency order matters.
-- ============================================================================

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  status text not null default 'PLANNING',
  deadline timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  priority text not null default 'MEDIUM',
  status text not null default 'PENDING',
  progress int not null default 0,
  deadline timestamptz,
  project_id uuid references projects(id) on delete set null,
  group_id uuid references groups(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_status_idx on tasks (status);
create index if not exists tasks_deadline_idx on tasks (deadline);
create table if not exists task_assignees (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'PENDING',
  progress int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null default '',
  media_id uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create table if not exists task_reminders (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (task_id, user_id, kind)
);
create table if not exists project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  host_id uuid not null references profiles(id) on delete cascade,
  group_id uuid references groups(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'SCHEDULED',
  room_name text not null,
  invite_token text not null unique,
  locked boolean not null default false,
  max_screens int not null default 2,
  screen_share_count int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists meeting_participants (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (meeting_id, user_id)
);
create table if not exists meeting_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  peak_participants int not null default 0
);
create table if not exists screen_share_claims (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

create table if not exists leaderboard_entries (
  game text not null,
  user_id uuid not null references profiles(id) on delete cascade,
  points int not null default 0,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (game, user_id)
);
create table if not exists leaderboard_history (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  user_id uuid not null references profiles(id) on delete cascade,
  delta int not null,
  points_after int not null,
  reason text not null,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists user_permissions (
  user_id uuid not null references profiles(id) on delete cascade,
  capability text not null,
  allowed boolean not null default true,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, capability)
);
create table if not exists role_permissions (
  role text not null,
  capability text not null,
  allowed boolean not null default true,
  primary key (role, capability)
);

create table if not exists group_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  token text not null unique,
  group_id uuid references groups(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  expires_at timestamptz,
  max_uses int,
  uses int not null default 0,
  approval_required boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists join_requests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references group_invites(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz
);

create table if not exists branding (
  id text primary key default 'singleton',
  app_name text not null default 'Wolf Clan',
  tagline text not null default 'One team. One vision.',
  logo_media_id uuid,
  banner_media_id uuid,
  updated_at timestamptz not null default now()
);
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  reason text not null,
  detail text,
  snapshot text,
  status text not null default 'OPEN',
  moderator_note text,
  resolved_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  detail text,
  created_at timestamptz not null default now()
);
create table if not exists bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  reason text not null default '',
  expires_at timestamptz,
  banned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);

create table if not exists hard_delete_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  target_id text not null,
  requested_by uuid references profiles(id) on delete set null,
  status text not null default 'RUNNING',
  message_count int not null default 0,
  file_count int not null default 0,
  freed_bytes int not null default 0,
  progress int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create table if not exists deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  target_id text not null,
  container text,
  deleted_at timestamptz not null default now()
);
create index if not exists deletion_tombstones_deleted_idx on deletion_tombstones (deleted_at);
create table if not exists cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dry_run boolean not null default false,
  status text not null default 'RUNNING',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts text,
  error text
);

-- Soft "deleting" markers so clients hide content before the rows are removed.
alter table direct_messages add column if not exists deleting_at timestamptz;
alter table group_messages add column if not exists deleting_at timestamptz;
alter table reviews add column if not exists deleting_at timestamptz;
alter table groups add column if not exists deleting_at timestamptz;
alter table tasks add column if not exists deleting_at timestamptz;
alter table projects add column if not exists deleting_at timestamptz;
alter table announcements add column if not exists deleting_at timestamptz;

-- Names become reusable after a hard delete; keep unique indexes simple (physical delete).
create unique index if not exists projects_name_key on projects (name);
create unique index if not exists groups_slug_key on groups (slug);

-- RLS for every Part 3 table
do $$
declare t text;
begin
  foreach t in array array['projects','project_members','tasks','task_assignees','task_comments','task_activity','task_reminders',
    'project_activity','meetings','meeting_participants','meeting_sessions','screen_share_claims','leaderboard_entries',
    'leaderboard_history','user_permissions','role_permissions','group_invites','join_requests','branding','reports',
    'audit_logs','bans','hard_delete_jobs','deletion_tombstones','cleanup_jobs']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create or replace function has_capability(cap text) returns boolean language sql stable security definer set search_path = public as $$
  select current_role_name() = 'OWNER'
     or coalesce((select allowed from user_permissions where user_id = auth.uid() and capability = cap), null) = true
     or (
       coalesce((select allowed from user_permissions where user_id = auth.uid() and capability = cap), null) is null
       and coalesce((select allowed from role_permissions where role = current_role_name() and capability = cap), false)
     );
$$;
revoke all on function has_capability(text) from anon;
grant execute on function has_capability(text) to authenticated;

create policy tasks_read on tasks for select using (
  has_capability('create_task')
  or exists (select 1 from task_assignees a where a.task_id = id and a.user_id = auth.uid())
);
create policy tasks_write on tasks for all using (has_capability('create_task')) with check (has_capability('create_task'));
create policy task_assignees_read on task_assignees for select using (
  user_id = auth.uid() or exists (select 1 from tasks t where t.id = task_id and (has_capability('create_task') or t.created_by = auth.uid()))
);
create policy task_assignees_self on task_assignees for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy task_children on task_comments for all using (true) with check (author_id = auth.uid());
create policy task_activity_read on task_activity for select using (true);
create policy task_reminders_self on task_reminders for select using (user_id = auth.uid());

create policy projects_read on projects for select using (true);
create policy projects_write on projects for all using (has_capability('manage_projects')) with check (has_capability('manage_projects'));
create policy project_members_read on project_members for select using (true);
create policy project_members_write on project_members for all using (has_capability('manage_projects')) with check (has_capability('manage_projects'));
create policy project_activity_read on project_activity for select using (true);

create policy meetings_read on meetings for select using (
  host_id = auth.uid() or has_capability('manage_meetings')
  or group_id is null
  or is_group_member(group_id)
  or exists (select 1 from meeting_participants p where p.meeting_id = id and p.user_id = auth.uid())
);
create policy meetings_write on meetings for all using (host_id = auth.uid() or has_capability('manage_meetings')) with check (host_id = auth.uid() or has_capability('manage_meetings'));
create policy meeting_participants_read on meeting_participants for select using (true);
create policy meeting_participants_self on meeting_participants for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy meeting_sessions_read on meeting_sessions for select using (true);
create policy screen_claims_self on screen_share_claims for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy leaderboard_read on leaderboard_entries for select using (true);
create policy leaderboard_write on leaderboard_entries for all using (has_capability('manage_leaderboard')) with check (has_capability('manage_leaderboard'));
create policy leaderboard_history_read on leaderboard_history for select using (true);

create policy permissions_self_read on user_permissions for select using (user_id = auth.uid());
create policy permissions_owner on user_permissions for all using (current_role_name() = 'OWNER') with check (current_role_name() = 'OWNER');
create policy role_permissions_read on role_permissions for select using (true);
create policy role_permissions_owner on role_permissions for all using (current_role_name() = 'OWNER') with check (current_role_name() = 'OWNER');

create policy invites_validate on group_invites for select using (true);
create policy invites_manage on group_invites for all using (has_capability('manage_members')) with check (has_capability('manage_members'));
create policy join_requests_self on join_requests for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy join_requests_manage on join_requests for select using (has_capability('manage_members'));

create policy branding_read on branding for select using (true);
create policy branding_owner on branding for all using (current_role_name() = 'OWNER') with check (current_role_name() = 'OWNER');

create policy reports_insert on reports for insert with check (reporter_id = auth.uid());
create policy reports_self on reports for select using (reporter_id = auth.uid() or has_capability('moderate_reviews'));
create policy reports_moderate on reports for update using (has_capability('moderate_reviews'));

create policy audit_read on audit_logs for select using (has_capability('view_audit'));
create policy audit_append on audit_logs for insert with check (true);
-- Append-only: no update or delete policy is created on purpose.
create policy bans_read on bans for select using (has_capability('ban_users') or user_id = auth.uid());
create policy bans_write on bans for all using (has_capability('ban_users')) with check (has_capability('ban_users'));

create policy hard_delete_read on hard_delete_jobs for select using (has_capability('hard_delete_any') or requested_by = auth.uid());
create policy tombstones_read on deletion_tombstones for select using (auth.uid() is not null);
create policy cleanup_read on cleanup_jobs for select using (current_role_name() = 'OWNER');
-- Service role only for inserts/updates on jobs.

-- Revoke EXECUTE from anon on every SECURITY DEFINER helper except the read-only role check.
revoke all on function is_group_member(uuid) from anon;
revoke all on function is_group_moderator(uuid) from anon;
revoke all on function group_can_post(uuid) from anon;
revoke all on function can_post_reviews() from anon;
revoke all on function purge_expired_media() from anon;
revoke all on function register_media_expiry() from anon;
grant execute on function current_role_name() to anon, authenticated;

-- Cron schedule for Part 3 jobs (replace <CRON_SECRET> via Supabase Vault, never commit it).
select cron.schedule('wolf-reminders', '*/15 * * * *', $$
  select net.http_get(
    url := 'https://YOUR-DOMAIN/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
  );
$$);
select cron.schedule('wolf-presence', '*/2 * * * *', $$
  select net.http_get(url := 'https://YOUR-DOMAIN/api/cron/presence',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
$$);
select cron.schedule('wolf-hard-delete-retry', '*/5 * * * *', $$
  select net.http_get(url := 'https://YOUR-DOMAIN/api/cron/retry',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
$$);
select cron.schedule('wolf-monthly-chat', '0 6 28 * *', $$
  select net.http_get(url := 'https://YOUR-DOMAIN/api/cron/monthly',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
$$);
select cron.schedule('wolf-temp-files', '0 18 * * *', $$
  select net.http_get(url := 'https://YOUR-DOMAIN/api/cron/temp',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
$$);
select cron.schedule('wolf-orphans', '0 19 * * 0', $$
  select net.http_get(url := 'https://YOUR-DOMAIN/api/cron/orphans',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
$$);
select cron.schedule('wolf-tombstone-prune', '30 18 * * *', $$
  select net.http_get(url := 'https://YOUR-DOMAIN/api/cron/tombstones',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
$$);
