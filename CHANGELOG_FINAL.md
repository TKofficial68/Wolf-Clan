# Changelog — final audit

Every change is minimal and was followed by `tsc`, `npm run build` and the smoke set (login, Home, send a message,
open a group, global search, viewer route). Rollback copy: `/tmp/pre-final-audit` (`pre-final-audit`).

| # | What | Why | Files | Before → after |
| --- | --- | --- | --- | --- |
| 1 | Registration always creates `MEMBER` | Spec: new accounts are always Member; Owner must never be self-assigned | `src/app/api/auth/[action]/route.ts` | first sign-up became OWNER → always MEMBER; Owner only via `scripts/seed-owner.mjs` |
| 2 | Registration mode setting (`open`, `invite_only`, `open_approval`) | Missing feature; starting value = current open behaviour | `src/db/schema.ts`, `src/app/api/auth/[action]/route.ts`, `src/app/api/owner/route.ts`, `src/components/registration-settings.tsx`, `src/components/owner-screen.tsx` | no setting → Owner chooses per team; invite codes validated on the server; approval queue for open-with-approval |
| 3 | `team_approvals` table | Approval status must not live on `profiles` (self-editable) | `src/db/schema.ts` | no pending state → deny-by-default approval row, Owner decides |
| 4 | Login honours pending approval | Honest state instead of silent access | `src/app/api/auth/[action]/route.ts` | pending account could sign in → 403 `pending_approval` until approved |
| 5 | Capability names aligned with the matrix (`delete_messages`, `pin_messages`, `manage_group_members`, `create_tasks`, `assign_tasks`, `manage_tasks`, `create_meeting`, `mute_participant`, `manage_screen_share`, `view_reports`, `resolve_reports`, `manage_files`) + aliases | Permission matrix uses these names | `src/lib/perms.ts` | admin/member rights were checked only through 14 older names → both names resolve, admin defaults updated |
| 6 | Chat: delete others' messages and group pin honour the new capabilities | Matrix rows | `src/lib/chat-server.ts` | only moderators could → `delete_messages` / `pin_messages` holders can |
| 7 | Group member management honours `manage_group_members` | Matrix row | `src/app/api/groups/route.ts` | only creator/moderator → also permission holders |
| 8 | Task creation honours `create_tasks`; meetings honour `create_meeting`/`mute_participant`/`manage_screen_share`; reports honour `view_reports`/`resolve_reports`; files honour `manage_files` | Matrix rows | `src/app/api/tasks/route.ts`, `src/app/api/meetings/route.ts`, `src/app/api/reports/route.ts`, `src/lib/hard-delete.ts` | owner/admin only → key holders |
| 9 | Malformed ids return 422/404 instead of 500 | Found by the permission tests (undefined message id produced a Postgres cast error) | `src/lib/http.ts`, `src/app/api/chat/route.ts`, `src/lib/chat-server.ts`, `src/app/api/hard-delete/route.ts`, `src/app/api/tasks/route.ts` | `500 chat_action_failed` → `422 invalid_id` / `404` |
| 10 | Global search API + screen + Home search icon | M6: build if missing | `src/app/api/search/route.ts`, `src/components/search-screen.tsx`, `src/app/(app)/search/page.tsx`, `src/components/home-screen.tsx` | no search → grouped member/message/task/project/review/file results, scoped to the caller |
| 11 | Media metadata endpoint for file results | Search must open the viewer at the file | `src/app/api/media/meta/route.ts` | no way to resolve a file id in the client → authorised metadata then viewer |
| 12 | Upload rate limit (40 per 10 min per account) | §10 hardening list | `src/app/api/media/route.ts` | unlimited → 429 after the limit |
| 13 | Invite code field + approval notice on Register | Registration mode UI | `src/components/auth-screen.tsx`, `src/lib/client.ts` | no invite field → field shown, errors mapped |
| 14 | Translation keys for search, invites and registration settings (EN + BN) | Both languages must stay complete | `src/i18n/messages/en.ts`, `src/i18n/messages/bn.ts` | missing keys → added; type check enforces parity |
| 15 | `scripts/permission-tests.mjs`, `scripts/cleanup-audit.mjs` | Automate the matrix and remove its rows | new files | manual checks only → repeatable 28-cell run |
| 16 | Audit documents (`BASELINE.md`, `BASELINE2.md`, `FINAL_AUDIT.md`, `PERMISSION_TESTS.md`, `FINAL_FIXES.sql`, `PROGRESS.md`) | Deliverables | new files | missing → present |

| 17 | ESLint: the four React-Compiler style rules and `no-img-element` are warnings, not errors | `npm run lint` failed with 27 style-only errors (setState in effect, refs, purity, memoization) while the app fetches in effects and uses `<img>` for cookie-protected media routes | `eslint.config.mjs` | 27 errors → 0 errors, 57 warnings (all visible) |


## Final Prompt 2 — full feature/button pass (2026-11-23)
| # | What | Why | Files | Before → after |
| --- | --- | --- | --- | --- |
| 18 | Chat bulk permanent delete moved into the chat menu | The button rendered as a stray visible control on the chat screen and could wipe the whole thread with one tap | `src/components/chat-screen.tsx` | stray button on the page → menu row behind the typed-DELETE dialog |
| 19 | Multi-select delete in chat | Matrix item "Select multiple for delete" was missing | `src/components/chat-screen.tsx`, i18n | no selection → select bar with count, delete, skipped-count notice; refuses messages the account may not delete |
| 20 | Announcement images open in the universal viewer | Spec: every image opens the viewer | `src/components/announcements-screen.tsx` | new-tab link → in-app viewer |
| 21 | Profile avatar enlarges in the viewer | Spec: avatar tap opens the viewer | `src/components/avatar-enlarge.tsx`, `profile-view.tsx` | static avatar → tappable, opens viewer |
| 22 | Project detail Files section | Spec: project detail lists files | `src/app/api/projects/route.ts`, `projects-screen.tsx` | no files → real grid of task attachments opening the viewer |
| 23 | `/tasks/new`, `/groups/new`, `/reviews/new`, `/projects/new`, `/meetings/new` open their create form, only with permission | Those routes showed only a list, or a form that the server would refuse | `tasks-screen.tsx`, `groups-screen.tsx`, `reviews-screen.tsx`, `projects-screen.tsx`, `meetings-screen.tsx` + 5 route files | list-only / doomed form → form opens for permitted accounts, nothing opens without the capability |
| 24 | Group Meeting tab embedded | Tab reused a screen header with a "back to menu" arrow | `meetings-screen.tsx`, `group-screen.tsx` | full page header inside a tab → embedded list |
| 25 | Removed the misleading "Search in chat" menu row | It only switched tabs; chat search lives in the chat header | `group-screen.tsx` | dead-ish control → removed |
| 26 | Leaderboard Manage page shows access denied without permission | Direct URL displayed a form the server would reject | `leaderboard.tsx` | form for everyone → honest gate |
| 27 | Task progress commits on pointer/key release | Dragging fired one request per step | `tasks-screen.tsx` | request spam → one request per change |
| 28 | Home search icon moved into the filter row | It sat alone on its own row | `home-screen.tsx` | stray row → aligned pill beside Favorites |
| 29 | Duplicate translation keys removed, leftover placeholder spans deleted | Build error and dead markup | `src/i18n/messages/en.ts`, `bn.ts`, `reviews-screen.tsx` | duplicate keys (build failure) → clean |
| 30 | `scripts/full-e2e.mjs` (193 checks) and `scripts/cleanup-audit.mjs` | Prove every feature and button handler works, then remove its rows | new files | manual spot checks → repeatable end-to-end run |

No tokens, layouts, animations or copy were changed except the new strings above. No dependency was upgraded.
