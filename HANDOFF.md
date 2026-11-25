# Wolf Clan — handoff

## a) Run locally
```bash
cp .env.example .env.local      # fill DATABASE_URL at minimum
npm install
npx drizzle-kit push             # creates the tables in this environment
node --env-file=.env scripts/seed-owner.mjs   # optional first Owner account
node --env-file=.env scripts/seed-part2.mjs   # eight default groups + owner settings
npm run dev                      # http://localhost:3000
```
Build and type checks: `npx next typegen && npx tsc --noEmit && npm run build`.

## b) Environment variables and where each one goes
| Variable | Where it is set | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Vercel (Production) | set after the first deploy |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | public, `https://glmftyjhxnzxybzmtdll.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | publishable client key |
| `NEXT_PUBLIC_LIVEKIT_URL` | Vercel | `wss://…`; unset means Meetings shows "not configured" |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel | web push public key |
| `NEXT_PUBLIC_APP_VERSION` | Vercel | `1.0.0` |
| `DATABASE_URL` | Vercel + Supabase | Postgres connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (Sensitive) | never in the browser |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Vercel + Supabase | meeting tokens and webhook verification |
| `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Vercel | push signing |
| `RESEND_API_KEY` / `EMAIL_FROM` | Vercel | verification, reset and contact email |
| `DEVELOPER_CONTACT_EMAIL` | Vercel | contact form recipient (server only) |
| `OWNER_CONTACT_EMAIL` | Vercel | contact form recipient (server only) |
| `CLEANUP_WORKER_SECRET` / `CRON_SECRET` | Vercel + Supabase Vault | cron authentication |
| `PUSH_WEBHOOK_SECRET` | Vercel + Supabase | push webhook authentication |
| `MAX_UPLOAD_MB` | Vercel | match your Storage plan limit |

`src/lib/env.ts` validates the required variables and reports the missing name. `src/lib/server/guard.ts` throws if any
server-only module is imported into client code. Run a secrets scan in CI: `gitleaks detect --no-git --redact`. If any key
was pasted into a chat or committed, rotate it in Supabase / Resend / LiveKit before release.

## c) Supabase dashboard settings (owner)
1. Authentication → URL Configuration: Site URL = your Vercel domain; Redirect URLs = `https://domain/auth/callback`,
   `https://domain/reset-password`, `http://localhost:3000/auth/callback`.
2. Authentication → Providers → Email: enabled, "Confirm email" ON, password minimum 8.
3. Storage: buckets `avatars` (public), `branding` (public), `temporary-files` (private); apply the policies in
   `MIGRATIONS_PROPOSED.sql`.
4. Database → Extensions: enable `pg_cron`, `pg_net`.
5. Database → Publications: add the tables listed under "Realtime tables" in `SUPABASE_TODO.md`.
6. LiveKit project: create, copy the URL/keys, add the webhook `https://domain/api/livekit/webhook` with the room events.

## d) SQL migrations, in order, and how to verify
1. `MIGRATIONS_PROPOSED.sql` Part 2 block (messages, groups, reviews, media, push, RLS, buckets, realtime, cron).
   Verify: run the RLS tests in `SECURITY_REPORT.md` §1; `select tablename from pg_tables` shows the tables; Storage shows
   three buckets.
2. Part 3 block (tasks, projects, meetings, leaderboard, permissions, invites, branding, reports, audit, bans, jobs,
   tombstones, cleanup). Verify: `select * from cleanup_jobs limit 1` after the first run; `\d tasks` shows the columns.
3. `database.types.ts` matches both blocks. Anything uncertain is in `SUPABASE_TODO.md` → "Needs confirmation".

## e) Cron jobs and the cleanup worker
Time zone is Asia/Dhaka (UTC+6, no DST).
| Job | Cron (UTC) | Endpoint |
| --- | --- | --- |
| Temp files | `0 18 * * *` | `GET /api/cron/temp` |
| Monthly chat cleanup | `0 6 28 * *` | `GET /api/cron/monthly` |
| Reminders (tasks + meetings) | `*/15 * * * *` | `GET /api/cron/reminders` |
| Presence sweep | `*/2 * * * *` | `GET /api/cron/presence` |
| Tombstone prune | `30 18 * * *` | `GET /api/cron/tombstones` |
| Hard-delete retry | `*/5 * * * *` | `GET /api/cron/retry` |
| Weekly orphan sweep | `0 19 * * 0` | `GET /api/cron/orphans` |

Every endpoint requires `Authorization: Bearer $CRON_SECRET` (or an Owner session) and returns clear JSON. Use
`?dryRun=1` to preview. The 401 fix: the same `CRON_SECRET` must exist in the Vercel project and in the Supabase cron
job header (`pg_cron` + `pg_net`), stored in Supabase Vault rather than in committed SQL. In this deployment the worker
deletes the `uploads` rows (Postgres is the storage) instead of calling the Storage API; on Supabase keep the same
procedure but remove objects through the Storage API first.

## f) LiveKit and VAPID
- LiveKit: create a project, copy `NEXT_PUBLIC_LIVEKIT_URL` (wss), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; webhook →
  `/api/livekit/webhook` for `participant_joined`, `participant_left`, `track_published`, `track_unpublished`,
  `room_finished`. Tokens grant microphone and screen share only; capacity is capped at 100 in the token route and in the
  room. Two screen shares are enforced by `screen_share_claims` + webhook.
- VAPID: `npx web-push generate-vapid-keys`; put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in
  `VAPID_PRIVATE_KEY`. iPhone needs the app added to the Home Screen (iOS 16.4+); the Settings screen says this.

## g) The five known Supabase items and their acceptance checks
1. **Cleanup worker 401** — cron calls `/api/cron/temp` with `Authorization: Bearer $CRON_SECRET`; a run creates a
   `cleanup_jobs` row with `status = DONE`. Check: `select kind,status,counts from cleanup_jobs order by started_at desc limit 3`.
2. **Storage policies present** — `select policyname, cmd from pg_policies where schemaname='storage'` lists the avatars,
   branding and temporary-files policies. Guessed path without a session returns 403.
3. **Realtime publication populated** — `select tablename from pg_publication_tables where pubname='supabase_realtime'`.
4. **SECURITY DEFINER functions hardened** — every function has `search_path=public`, checks `auth.uid()`, and has
   `EXECUTE` revoked from `anon` except `current_role_name()`.
5. **Owner accounts verified** — `select id, role from profiles where role='OWNER'`; no app route changes an Owner role,
   bans an Owner, or deletes Owner content except by an Owner.

## h) Integrity checks and storage numbers
Run `integrity-checks.sql`; every query must return zero rows. Storage usage is read live from `uploads`
(Owner Controls → Storage and Dashboard): note the figure, run a permanent delete, reload; the number must drop by the
deleted size. On Supabase read `select sum((metadata->>'size')::bigint) from storage.objects` before and after.

## i) Known limits
- Realtime is polled in this deployment (Supabase sockets are not configured here); the subscription design is in the
  migration.
- Meetings, push delivery and email depend on owner-supplied keys and are reported as "not configured" until then.
- Downloads on iPhone go to Files; "Save to Photos" uses the system share sheet.
- Recording is intentionally absent from meetings.
- Monthly cleanup deletes chat messages and their files only; reviews, announcements, tasks, projects and meetings stay.

## j) Final audit pass (2026-11-23)
New in this pass: registration modes, sign-up approvals, global search, matrix permission names, malformed-id guards and
an upload rate limit. The audit trail is in `FINAL_AUDIT.md`, `PERMISSION_TESTS.md`, `CHANGELOG_FINAL.md`,
`BASELINE2.md` and `PROGRESS.md`.

Apply in this order:
1. `MIGRATIONS_PROPOSED.sql` Part 2 block.
2. `MIGRATIONS_PROPOSED.sql` Part 3 block.
3. `FINAL_FIXES.sql` (registration mode, team approvals, capability seeds, permission helper, revokes, notification
   hardening, member directory, storage policies, realtime). Every section is re-runnable.
4. `integrity-checks.sql` — all checks must return zero rows.

Verify after applying:
- `select private.is_global_owner();` returns true only for an Owner account.
- `select * from owner_settings;` shows `registration_mode` (set it in Owner Controls → Invites; recommended: `invite_only`).
- `select list_team_directory();` returns the team so Home and search can show members.
- `select proname, proacl from pg_proc where proname like 'claim_expired%' or proname like 'finish_media%';` shows no
  `anon` grant.
- Registration: with `invite_only`, signing up without a code returns "invite required"; with `open_approval`, the account
  waits until approved in Owner Controls → Invites.
- Permissions: run `BASE=... OWNER_EMAIL=... OWNER_PASSWORD=... node scripts/permission-tests.mjs`; 28/28 expected, then
  `node --env-file=.env scripts/cleanup-audit.mjs` to remove the test rows.

Known limits added by this pass: the audit environment cannot reach Supabase, so database-side items are BLOCKED-SQL;
Lighthouse, real devices and LiveKit remain NOT-VERIFIED.

## k) Test suites added in the final pass
- `scripts/full-e2e.mjs` — 193 functional checks covering every API surface and every route.
  Run against a running server: `BASE=http://127.0.0.1:3000 node scripts/full-e2e.mjs` (needs `/tmp/chat.jpg`; create it with
  `npx sharp-cli` or any JPEG). It creates its own Member account and content.
- `scripts/permission-tests.mjs` — 31 permission-matrix cells.
- `scripts/cleanup-audit.mjs` — removes the accounts, groups, messages and jobs created by the two suites.
Run the cleanup after each suite so the database stays at one Owner and the eight default groups.
