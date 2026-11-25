# Permission tests

Method: `scripts/permission-tests.mjs` runs against the running production server with two real sessions — the Owner and
a freshly registered Member that the Owner puts in a throwaway group created for the run. Every call is a hand-made
request without the UI, so a refusal here is a real server refusal. The run creates its own group and restricted group,
never touching a default group, and `scripts/cleanup-audit.mjs` removes the accounts and rows afterwards.
Last run: 2026-11-23 — **31/31 cells matched the matrix** (28 master-matrix rows plus three setup/permission checks).

| # | Action | Actor | HTTP | Expected | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | registration role is MEMBER | new account | MEMBER | MEMBER | PASS |
| 2 | home api | signed-out | 401 | refused | PASS |
| 3 | chat load | signed-out | 401 | refused | PASS |
| 4 | owner dashboard | signed-out | 401 | refused | PASS |
| 5 | owner dashboard | member | 403 | refused | PASS |
| 6 | owner audit csv | member | 403 | refused | PASS |
| 7 | owner dashboard | owner | 200 | allowed | PASS |
| 8 | send own message | member | 200 | allowed | PASS |
| 9 | send own message | owner | 200 | allowed | PASS |
| 10 | delete others' message for everyone | member | 403 | refused | PASS |
| 11 | pin in group | member | 403 | refused | PASS |
| 12 | pin in group | owner | 200 | allowed | PASS |
| 13 | delete others' message for everyone | owner | 200 | allowed | PASS |
| 14 | post in restricted group | member | 403 | refused | PASS |
| 15 | post in restricted group | owner | 200 | allowed | PASS |
| 16 | read group without membership | member | 403 | refused | PASS |
| 17 | create announcement | member | 403 | refused | PASS |
| 18 | create announcement | owner | 200 | allowed | PASS |
| 19 | create group | member | 403 | refused | PASS |
| 20 | moderate review | member | 403 | refused | PASS |
| 21 | create task | member | 403 | refused | PASS |
| 22 | manage leaderboard | member | 403 | refused | PASS |
| 23 | manage leaderboard | owner | 200 | allowed | PASS |
| 24 | create meeting | member | 403 | refused | PASS |
| 25 | reports queue | member | 403 | refused | PASS |
| 26 | submit report | member | 200 | allowed | PASS |
| 27 | invites list | member | 403 | refused | PASS |
| 28 | invites list | owner | 200 | allowed | PASS |
| 29 | cron worker | api without secret | 401 | refused | PASS |
| 30 | permanent delete owner content | member | 403 | refused | PASS |
| 31 | permanent delete own content | member | 200 | allowed | PASS |

Additional checks executed by hand in this audit:

| Check | Result |
| --- | --- |
| Banned account login | returns `banned` with the reason; a ban also revokes that account's sessions |
| Removed group member reads the group | 403 `not_a_member` (membership is checked on every chat call) |
| Restricted group posting | Member 403, Owner 200 |
| Admin without a capability | treated as Member; only `role_permissions`/`user_permissions` count |
| Permission removed | capabilities are read from the database on every request, so the next call and the next render lose it |
| Owner account changed from the app | refused (`owner_protected`) for role, title, ban and force-sign-out |
| Registration modes | invite-only without a code → `invite_required`; valid code → account; approval mode → `needsApproval`, login 403, Owner approves, login 200 |
| Malformed ids | chat 422, permanent delete 422, task detail 404 — no 500 |
| Rate limits | repeated registrations from one IP hit `rate_limited` (429); the test harness now clears attempts before a run |

Database-level cells that cannot be executed from this environment are **BLOCKED-SQL** in `FINAL_AUDIT.md`:
`private.is_global_owner()` coverage, `create_group` restriction, worker-function grants and `create_notification` abuse.
Statements and verification queries are in `FINAL_FIXES.sql`.
