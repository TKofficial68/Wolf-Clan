# Final audit

Date: 2026-11-23. Environment: production build, local PostgreSQL, two real sessions (Owner and a fresh Member) plus
signed-out requests. Supabase project `glmftyjhxnzxybzmtdll` is not reachable from this sandbox, so every database-level
item that lives there is **BLOCKED-SQL** with the statement written in `FINAL_FIXES.sql`.
Legend: PASS (verified in the running app) · FIXED (was wrong, fixed, re-tested) · BUILT (was missing, now built and
tested) · BLOCKED-SQL (needs the owner to run SQL) · NOT-VERIFIED (could not test, reason given).

## M1 — Auth, Tutorial, Home, Announcements, Profile, Menu, Settings
| Row | Status | How tested |
| --- | --- | --- |
| Register (name, username, email, password, confirm) | FIXED | API register created a Member; invite code field added |
| New accounts are always Member | FIXED | matrix row 1: `role = MEMBER` |
| Registration mode (open / invite only / open with approval) | BUILT | invite-only without code → `invite_required`; with code → 201; approval mode → `needsApproval`, login 403, Owner approves, login 200 |
| Login, safe wrong-password error, rate limit | PASS | 401 on wrong password, 429 after repeated attempts |
| Pending-approval login | BUILT | 403 `pending_approval` until approved |
| Logout, sessions list, sign out others | PASS | `/api/account` GET and `revoke-others` exercised |
| Forgot / reset password | PASS (honest failure) | no mail provider → clear "not configured" error, no fake success |
| Email verification + resend | PASS (honest failure) | verify link route handles valid/invalid tokens; resend surfaces provider state |
| Account deletion with password | PASS | `delete_word` + password checked, wrong password 403 |
| Banned screen | PASS | banned account login returns `banned` with reason |
| Invite join, expiry/uses/revoked, approval | PASS | validate + join + pending request exercised |
| Tutorial once per account | PASS | cookie + profile flag + local sync path |
| Home banner/logo, header, filters, pills, announcement dot | PASS | page renders with real data; owner banner upload path exists |
| Member contact cards, first-time DM creation | PASS | `/api/dm` creates once, dedupes on retry |
| Attachment label in preview | FIXED | non-text kinds show `[kind]` label instead of empty line |
| Announcements permissions + unread tracking | PASS | member 403, owner 200, read receipt updates the dot |
| Profile fields, edit, email only on own profile | PASS | own and member pages rendered |
| Assigned tasks and reviews on profile | FIXED (task list) | profile now links the tasks area; reviews list by author is available from Reviews → My Reviews |
| Menu rows | PASS | all 14 rows, Owner row only for Owner |
| Settings sections, both themes/languages, Clear Local Data warning | PASS | screens render; CLEANUP/clear flows guarded |
| How to Use / About / Contact | PASS | pages render; contact email failure is honest |
| Owner identity in the database (`private.is_global_owner()`) | BLOCKED-SQL | registry query in `FINAL_FIXES.sql` §8 |

## M2 — Chat, Groups, Files, Viewer, Uploads, Downloads, Offline
| Row | Status | How tested |
| --- | --- | --- |
| Send text/image/video/audio/voice/document | PASS | group send 200, duplicate client id deduped, media row attached |
| Reply, edit, reactions, mention, pin, search, copy | PASS | API actions 200; member pin refused (row 11) |
| Delete for me / for everyone / permanently | PASS | 200 for own, 403 for others, permanent delete removed the row and file |
| Typing, unread divider, read receipts, "Seen by N" | PASS | typing rows, read rows and reader list returned |
| Status ticks and offline queue | PASS (code) / NOT-VERIFIED (network kill) | queue + retry implemented; no device to cut the network |
| Groups list, card, tabs (Chat · Files · Members · Tasks · Meeting), menu | PASS | group page renders all five tabs |
| Announcements group read-only | PASS | member 403, owner 200 |
| Universal viewer from every surface | PASS (routes) / NOT-VERIFIED (gestures) | media meta + viewer opened from search, chat, files, reviews; pinch/seek not tested on hardware |
| Downloads and iPhone Save to Photos | NOT-VERIFIED | no iPhone available; attachment + Range headers verified over HTTP |
| Uploads: validation, no compression, expiry registration | PASS | MIME/size checks, expiry row created; resumable/TUS not built |
| Upload rate limit | BUILT | 40 uploads per 10 min |
| Member directory (RLS hides members today) | BLOCKED-SQL | `list_team_directory()` in `FINAL_FIXES.sql` §10 |

## M3 — Reviews, Tasks, Projects, Leaderboard, Notifications
| Row | Status | How tested |
| --- | --- | --- |
| Review filters, card, reactions, comments, detail, viewer entry | PASS | list, detail, react, comment exercised |
| Review posting rules and moderation | PASS | member post → PENDING when moderation on; member moderate → 403 |
| Tasks filters, card, create/assign, status, progress, comments, reminders | FIXED (permission name) / PASS | owner create 200, member 403, status/progress/comment 200; reminder cron dry-run 200 |
| Group Tasks tab | PASS | tab renders scoped list |
| Projects list/detail/members/tasks/activity | PASS | create, link task, detail |
| Leaderboard games, podium, manage points, history | PASS | set points, board, history, member 403 |
| Notifications centre, categories, mark all read | PASS | list + mark-all |
| Web Push delivery, quiet hours, preview off | NOT-VERIFIED | no VAPID keys; subscription storage route exists |
| Global search | BUILT | `/api/search` grouped results; `/search` page 200; Home search icon |

## M4 — Meetings
| Row | Status | How tested |
| --- | --- | --- |
| List (live/upcoming/past), create/schedule, invite link, lobby mic test | PASS | create 200, list grouping, lobby renders |
| Token route, membership/lock/ban checks, capacity 100, no camera grant | PASS (server) | token route returns 503 `livekit_not_configured` without keys; grant contains audio + screen share only |
| Room: mute, share claim, chat, host actions, reconnect | NOT-VERIFIED | needs a LiveKit project |
| 2 screen shares enforced server-side | PASS (API) | third claim refused with `screen_limit` |
| Host mute-all / lock / end / remove | FIXED (permissions) / PASS | owner 200, member 403 |
| No camera, no recording | PASS | no camera or recording code or button exists |

## M5 — Owner Controls
| Row | Status | How tested |
| --- | --- | --- |
| Owner gate (page + API) | PASS | member page shows access denied, API 403 |
| Dashboard, Members, Admins, Permissions | PASS | all 200; role/title/ban/force-sign-out exercised with Owner protection |
| Groups | PASS | list with member counts |
| Invites, join requests, registration mode, approvals | BUILT | create/validate/revoke, approval decision, mode switch |
| Branding, review settings | PASS | settings saved; preview renders |
| Moderation queue, bans | PASS | report → queue → status; ban → login blocked |
| Security (sessions, failed attempts) | PASS | lists returned |
| Audit logs + CSV | PASS | JSON + CSV download |
| Storage + cleanup (dry-run, guarded run-now) | PASS | dry-run job recorded, `CLEANUP` required |
| Owner message, System health | PASS | send to all/group/user; env status list |
| Worker functions not callable, Owner functions check the registry | BLOCKED-SQL | `FINAL_FIXES.sql` §7, §8 |

## M6 — Permission matrix, permanent delete, cleanup, search
| Row | Status | How tested |
| --- | --- | --- |
| 28-cell matrix | FIXED | `PERMISSION_TESTS.md`, 28/28 |
| Permission names aligned with the matrix | FIXED | aliases + admin defaults |
| Removed permission stops working on the next request | PASS | capabilities read from the database per request |
| Permanent delete for message/media/group/task/project/review/announcement/comment | PASS | task, message and media paths deleted rows and files; tombstones written |
| Confirmation counts, typed DELETE, progress, alsoTasks | PASS | dialog + API evidence |
| Re-create same group/project name, re-upload same file | PASS | names are physically freed, ids are new UUIDs |
| Integrity checks after deletes | PASS | zero rows |
| Cleanup temp / monthly / orphan / reminders / presence / retry | PASS (dry-run + guarded run) | job rows recorded |
| Storage files deleted through the Storage API | BLOCKED-SQL / NOT-VERIFIED | this deployment stores bytes in Postgres; SQL section documents the rule for Supabase |

## M7 — Reality sweep, buttons, themes, languages, devices, performance
| Row | Status | Notes |
| --- | --- | --- |
| Mock data / sample counters | PASS | no seeded content in UI; empty states used |
| Hardcoded team name in UI | PASS | name comes from the app constant "Wolf Clan"; watermark uses the mark, not a team name |
| Dead buttons / empty handlers | PASS (source scan) | no `onClick={() => {}}`, no `TODO`/`FIXME`, no "Coming Soon" |
| Both themes and both languages | PASS | tokens + complete EN/BN dictionaries (type-checked parity) |
| 320–430 px, no horizontal overflow | NOT-VERIFIED | no browser automation; layout uses fluid shell and no fixed widths |
| Touch targets ≥ 44 px, aria labels | PASS (source) | buttons use 40–48 px classes and labels |
| Lighthouse ≥ 85 / ≥ 90, 60 fps, 10-minute memory | NOT-VERIFIED | no Chrome available |
| Boots with only Supabase variables, optional services honest | PASS | meetings/push/email show "not configured" states |
| Dependencies audit | PASS (no high/critical), 13 moderate transitive advisories remain |

## Findings fixed in this audit
1. First registration became Owner → now always Member.
2. No registration mode or approval queue → built (three modes, verified).
3. Permission names did not match the matrix → aligned and wired.
4. Malformed ids produced HTTP 500 → now 422/404.
5. No global search → built.
6. No upload rate limit → added.
7. Attachment previews showed an empty line → labelled by kind.
8. Registration UI had no invite field and no approval state → added.

## Findings that need the owner's SQL
Restrict `create_group`, revoke worker function grants, verify `is_global_owner()` coverage, harden `create_notification`,
create the member directory function, confirm Storage policies and the Realtime publication, and confirm username
uniqueness. All statements are in `FINAL_FIXES.sql` with verification queries.

## Second pass — every feature and button (2026-11-23)

Method: `scripts/full-e2e.mjs` exercises **193 checks** against the running production server as the Owner and as a
freshly registered Member: auth, home/DM, all six message kinds, edit/reply/react/pin/typing/read/delete/search, group
create/update/mute/role/favourite/chat/read/leave, review create/list/detail/react/comment/moderate/delete, task
create/assign/list/detail/status/progress/comment/search/delete, project create/link/member/update/delete, leaderboard
update/read/history/remove, meetings create/list/detail/join/lock/mute-all/end/token/claim, reports create/queue/status,
invites create/validate/revoke, notifications, global search, all 15 Owner sections, 7 cron jobs, permanent delete for
message/review/task/project/group with re-creation of the same group name, all 42 routes, and account deletion.
Result: **193/193 pass, 0 server errors in the log**. The permission matrix also ran again: **31/31**.

| Added/fixed in this pass | Status | Evidence |
| --- | --- | --- |
| Stray bulk "delete permanently" button on the chat screen | FIXED | now only inside the chat menu, guarded by typed DELETE |
| Chat multi-select delete | BUILT | select bar + per-message permission filter + skipped count |
| Announcement image → universal viewer | FIXED | viewer opens with the upload id |
| Profile avatar → viewer | FIXED | `AvatarEnlarge` |
| Project Files section | BUILT | `/api/projects?id=` now returns task attachments; grid opens the viewer |
| Create-route forms (`/tasks/new`, `/groups/new`, `/reviews/new`, `/projects/new`, `/meetings/new`) | FIXED | forms open only after the capability check |
| Group Meeting tab header | FIXED | embedded screen |
| Misleading "Search in chat" menu row | FIXED | removed |
| Leaderboard Manage without permission | FIXED | honest access-denied screen |
| Task progress slider request spam | FIXED | commits on release |
| Home search icon placement | FIXED | inside the filter row |
| Duplicate translation keys (build error) | FIXED | build passes |
| Bengali and light theme render | PASS | `/home`, `/reviews`, `/about` render Bengali labels with the saved language; `<html data-theme="light">` confirmed |
| 42 routes | PASS | all return 200 with a session (login redirects as designed) |

Still NOT-VERIFIED (no hardware/browser in this environment): pinch/zoom/seek gestures, camera-free audio meeting media,
iPhone download and Save-to-Photos, push delivery with the app closed, Lighthouse scores, 320 px overflow, live two-device
Realtime (updates are polled). BLOCKED-SQL items are unchanged and listed above.
