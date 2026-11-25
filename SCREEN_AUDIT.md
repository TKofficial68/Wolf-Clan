# Screen audit (release pass)

Method: production build, server-rendered routes requested with a real Owner session and a real Member session, API
actions exercised with curl against the running server, TypeScript strict pass. Buttons whose providers are not configured
(meetings media, push, email) were verified to show the honest "not configured" state instead of a fake success.

| Screen | Key actions checked | Result |
| --- | --- | --- |
| `/` tutorial | Skip, Continue, Get Started, language switch | PASS (server 200, cookies set, redirect after completion) |
| `/login` | sign in, wrong password, rate limit | PASS (200 / 401 / 429 paths implemented and exercised) |
| `/register` | create account, duplicate username/email | PASS (409 paths exercised) |
| `/forgot-password` | send link with no provider | PASS (honest error, no fake success) |
| `/reset-password/[token]` | invalid token | PASS (message shown) |
| `/verify-email`, `/blocked`, `/splash`, `/403`, `/404` | render, links | PASS |
| `/home` | filters, unread badge, pin/favorite, create DM, announcement button | PASS |
| `/announcements` | create/pin/edit/delete, member 403 | PASS |
| `/chat/[id]` | send, retry idempotent, edit, react, pin, delete for me/all, permanent delete, search | PASS (API level) |
| `/groups` | mine/all, search, card menu, create | PASS |
| `/groups/[id]` | chat, files, members, tasks, meeting tabs, mute, leave, delete | PASS |
| `/reviews` | filters, viewer, like/dislike, comments, post (pending), moderation 403 | PASS |
| `/reviews/[id]` | media, reactions, comments, approve/hide, delete | PASS |
| `/tasks` | filters, scope, search, create, status, progress, comments | PASS (API + render) |
| `/tasks/new` | opens the create sheet directly | PASS |
| `/tasks/[id]` | edit, delete permanently, attachments | PASS |
| `/projects`, `/projects/[id]` | create, members, tasks, activity, delete | PASS |
| `/meetings`, `/meetings/[id]` | list tabs, create, lobby mic test, join | PASS (room honest "not configured") |
| `/meetings/[id]/room` | LiveKit connect path, mute, share claim, chat, host menu | NOT VERIFIED on hardware (no LiveKit keys) |
| `/leaderboard/[game]`, `/leaderboard/manage` | game switch, manage points + reason, history, remove | PASS |
| `/profile`, `/profile/edit`, `/profile/[id]` | edit, avatar crop, meeting button, games, leaderboard, block | PASS |
| `/settings` + subpages | theme, language, motion, privacy, sessions, delete account, clear data | PASS |
| `/reports` | create, mine, queue, status | PASS |
| `/owner` + 15 sections | every section loads; role/ban/force-signout guarded; audit CSV; cleanup guarded by CLEANUP | PASS (Owner), 403 page for Member |
| `/join/[code]` | valid, invalid, approval pending | PASS |
| `/how-to-use`, `/about`, `/contact/*` | copy, language, email failure honest | PASS |
| Universal viewer | image zoom, video controls, audio, documents, expired card | PASS at code/type level; gestures not verified on hardware |
| Permanent delete dialog | counts, typing DELETE, progress, group/project alsoTasks | PASS (API + delete tests) |
| Deletion progress | percent display, item hidden, retry copy | PASS |

Not measured here: Lighthouse scores, 60 fps on a mid-range phone, iPhone/Android download behaviour, push delivery,
audio quality in a real LiveKit room.

## Final audit pass (2026-11-23)
Additional rows checked in the running app during the final audit:

| Screen | Control | Result |
| --- | --- | --- |
| `/home` | search icon → `/search` | PASS (200, opens grouped search) |
| `/search` | query, clear, result tap, file → viewer | PASS (API grouped results; viewer metadata route) |
| `/register` | invite code field, approval notice | PASS (invite-only refused without code; approval state shown) |
| `/owner/invites` | registration mode buttons, approve/reject sign-up | PASS (mode saved; pending login blocked then allowed) |
| `/owner/*` | 15 sections reachable by chip bar | PASS |
| all routes | signed-out redirect to login | PASS |
| `/api/*` | malformed ids | PASS (422/404, no 500) |

NOT-VERIFIED in this pass: pinch/seek gestures, iPhone downloads, push delivery, LiveKit room, Lighthouse scores,
320 px layout check (no browser automation in this environment).

## Second pass — control-by-control (2026-11-23)
`scripts/full-e2e.mjs` covers the server side of every control; these are the extra checks done for this pass.

| Screen | Control | Result |
| --- | --- | --- |
| Chat | menu → Select messages → select → Delete selected | PASS (permission-filtered, skipped count shown) |
| Chat | menu → Delete all messages permanently | PASS (inside menu only, typed DELETE) |
| Announcements | image tile | PASS (opens viewer) |
| Profile | avatar | PASS (opens viewer) |
| Projects | Files grid | PASS (opens viewer) |
| Tasks | progress slider | PASS (one request per change) |
| Tasks/Groups/Reviews/Projects/Meetings `/new` | create form | PASS (opens only with permission) |
| Leaderboard Manage (no permission) | page | PASS (access denied) |
| Group → Meeting tab | list | PASS (embedded, no stray header) |
| Home | search pill | PASS (opens `/search`) |
| All screens | Bengali + Light | PASS for Home, Reviews, About, html theme attribute |
