-- ===========================================================================
-- Wolf Clan — final audit SQL. Apply top to bottom on the Supabase project.
-- Every section is re-runnable (IF NOT EXISTS / CREATE OR REPLACE / DO blocks).
-- Nothing here was executed against the live project from this environment.
-- Sections marked [PART2] and [PART3] mirror MIGRATIONS_PROPOSED.sql.
-- ===========================================================================

-- 0. Sanity: do not run as a normal user.  --------------------------------
-- select private.is_global_owner();  -- must be true only for an Owner account.

-- 1. [PART2] Chat, groups, reviews, media metadata, push --------------------
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

-- 2. [PART3] Tasks, projects, meetings, leaderboard, invites, moderation ----
-- (Full table definitions are in MIGRATIONS_PROPOSED.sql Part 3; run that block
--  first, then continue below. This file adds only the audit fixes.)

-- 3. Registration mode + sign-up approvals ---------------------------------
alter table owner_settings add column if not exists registration_mode text not null default 'open';
-- starting value equals the behaviour before this fix (open registration).
alter table owner_settings drop constraint if exists owner_settings_registration_mode_check;
alter table owner_settings
  add constraint owner_settings_registration_mode_check
  check (registration_mode in ('open', 'invite_only', 'open_approval'));

create table if not exists team_approvals (
  user_id uuid primary key references profiles(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at timestamptz not null default now(),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz
);
alter table team_approvals enable row level security;
create policy team_approvals_self_read on team_approvals for select using (user_id = auth.uid());
create policy team_approvals_owner on team_approvals for all
  using (private.is_global_owner()) with check (private.is_global_owner());

-- 4. Capability names used by the app (matrix) ------------------------------
-- role_permissions/user_permissions accept the capability text; seed the Admin defaults
-- so an Admin created in the dashboard has the documented keys.
insert into role_permissions (role, capability, allowed) values
  ('ADMIN','post_announcement',true), ('ADMIN','delete_any_message',true), ('ADMIN','delete_messages',true),
  ('ADMIN','create_group',true), ('ADMIN','manage_groups',true), ('ADMIN','manage_group_members',true),
  ('ADMIN','manage_members',true), ('ADMIN','pin_messages',true), ('ADMIN','ban_users',true),
  ('ADMIN','moderate_reviews',true), ('ADMIN','post_review',true), ('ADMIN','create_task',true),
  ('ADMIN','create_tasks',true), ('ADMIN','assign_tasks',true), ('ADMIN','manage_tasks',true),
  ('ADMIN','manage_projects',true), ('ADMIN','manage_meetings',true), ('ADMIN','create_meeting',true),
  ('ADMIN','mute_participant',true), ('ADMIN','manage_screen_share',true), ('ADMIN','view_reports',true),
  ('ADMIN','resolve_reports',true), ('ADMIN','manage_files',true), ('ADMIN','manage_leaderboard',true),
  ('ADMIN','view_audit',true),
  ('MEMBER','post_review',true)
on conflict (role, capability) do nothing;

-- 5. Permission helper used by RLS (single source of truth) ----------------
create or replace function public.has_capability(cap text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select tm.role = 'OWNER' from team_members tm where tm.user_id = auth.uid() and tm.status = 'ACTIVE'
  ), false)
  or coalesce((select allowed from user_permissions where user_id = auth.uid() and capability = cap), null) = true
  or (
    coalesce((select allowed from user_permissions where user_id = auth.uid() and capability = cap), null) is null
    and coalesce((select rp.allowed from role_permissions rp
                  join team_members tm on tm.role = rp.role
                  where tm.user_id = auth.uid() and tm.status = 'ACTIVE' and rp.capability = cap), false)
  );
$$;
revoke all on function public.has_capability(text) from anon, public;
grant execute on function public.has_capability(text) to authenticated;

-- 6. create_group: Owner or create_group permission only ------------------
-- Wrap the existing SECURITY DEFINER body rather than rewriting it.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'create_group') then
    execute $fn$
      create or replace function public.create_group_guard() returns trigger language plpgsql security definer
      set search_path = public as $body$
      begin
        if not public.has_capability('create_group') then
          raise exception 'not allowed to create groups' using errcode = '42501';
        end if;
        return new;
      end;
      $body$;
    $fn$;
  end if;
end $$;
-- Simpler and safer alternative: revoke direct execute and route creation through the app.
revoke execute on function public.create_group from anon, public;

-- 7. Worker + Owner functions: not callable by clients --------------------
revoke execute on function public.claim_expired_media_jobs from anon, public, authenticated;
revoke execute on function public.finish_media_cleanup_job from anon, public, authenticated;
revoke execute on function public.get_owner_settings from anon, public, authenticated;
revoke execute on function public.get_owner_audit_logs from anon, public, authenticated;
revoke execute on function public.get_media_cleanup_status from anon, public, authenticated;
revoke execute on function public.update_owner_setting from anon, public, authenticated;
revoke execute on function public.permanently_delete_project from anon, public;
revoke execute on function public.permanently_delete_task from anon, public;
revoke execute on function public.permanently_delete_task_comment from anon, public;
grant execute on function public.get_owner_settings to authenticated;
grant execute on function public.get_owner_audit_logs to authenticated;
grant execute on function public.get_media_cleanup_status to authenticated;
grant execute on function public.update_owner_setting to authenticated;

-- 8. Owner authority comes from the registry, never from team_members alone -
-- Every Owner-only function must call private.is_global_owner(); audit query:
-- select p.proname, p.prosecdef,
--        (position('is_global_owner' in pg_get_functiondef(p.oid)) > 0) as checks_registry
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prosecdef order by p.proname;
-- Every row with checks_registry = false must be reviewed before release.

-- 9. create_notification: prevent impersonation --------------------------
-- Keep SECURITY INVOKER and make it refuse notifications about other users unless
-- the caller is the Owner or the notification is for the caller.
create or replace function public.create_notification(
  p_user_id uuid, p_kind text, p_title text, p_body text default null, p_href text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_user_id <> auth.uid() and not private.is_global_owner() then
    raise exception 'cannot notify another member' using errcode = '42501';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title required';
  end if;
  insert into notifications (user_id, kind, title, body, href)
  values (p_user_id, coalesce(p_kind, 'system'), left(p_title, 120), left(p_body, 240), p_href)
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.create_notification from anon, public;
grant execute on function public.create_notification to authenticated;

-- 10. Member directory for Home and search (members cannot read each other today)
create or replace function public.list_team_directory()
returns table (id uuid, username text, display_name text, avatar_path text, role text, is_online boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_path, tm.role,
         coalesce(up.status = 'online' and up.last_seen_at > now() - interval '90 seconds', false)
  from profiles p
  join team_members tm on tm.user_id = p.id and tm.status = 'ACTIVE'
  left join user_presence up on up.user_id = p.id
  where private.is_active_team_member();
$$;
revoke all on function public.list_team_directory() from anon, public;
grant execute on function public.list_team_directory() to authenticated;

-- 11. Hard delete must remove Storage objects, not storage.objects rows ----
-- Database functions cannot call the Storage API. The app removes files through the
-- Storage API first, then calls the SQL delete. Keep this comment as the rule:
-- never `delete from storage.objects`; always storage.from(bucket).remove(paths).

-- 12. Storage policies (idempotent) --------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars','avatars',true), ('branding','branding',true), ('temporary-files','temporary-files',false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='avatars_public_read') then
    create policy avatars_public_read on storage.objects for select using (bucket_id = 'avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='avatars_owner_write') then
    create policy avatars_owner_write on storage.objects for insert with check (bucket_id = 'avatars' and owner = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='temporary_member_read') then
    create policy temporary_member_read on storage.objects for select using (bucket_id = 'temporary-files' and auth.uid() is not null);
  end if;
end $$;

-- 13. Realtime publication ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['direct_messages','group_messages','direct_message_reactions','group_message_reactions',
    'group_message_reads','typing_states','notifications','reviews','review_reactions','review_comments','review_reads',
    'user_presence','group_members','hard_delete_jobs','deletion_tombstones']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 14. Verification queries (read-only) ----------------------------------
-- select private.is_global_owner();
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
-- select policyname from pg_policies where schemaname = 'storage';
-- select proname, proacl from pg_proc where proname in ('claim_expired_media_jobs','finish_media_cleanup_job');
