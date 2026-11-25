# Baseline — Final Prompt 1 (state at the start of the final audit)

Recorded before any change of Final Prompt 2. No git repository exists in this workspace, so the rollback point is a
filesystem copy: `cp -a src public *.md *.sql *.ts .env.example /tmp/pre-final-audit/` (tag name `pre-final-audit`),
plus this document and `BASELINE2.md`.

## Build baseline
| Check | Result |
| --- | --- |
| Node | 22.x |
| Dependencies | installed (`node_modules` present) |
| `npx next typegen` | pass |
| `tsc --noEmit` | pass, 0 errors |
| `npm run build` | pass |
| `build_and_start` + `/api/health` | pass (`{"ok":true}`) |
| Database | local PostgreSQL, schema applied with `drizzle-kit push`; no Supabase project reachable from this sandbox |
| Accounts | one seeded Owner account, eight seeded default groups |

## What already worked (must not regress)
Auth (register/login/logout/reset/verify/banned), tutorial, home (banner, filters, pills, owner-first list, pin/favourite,
create DM), announcements, profile + edit, menu, settings (all sections), chat engine (send/edit/delete/react/pin/reply/
search/typing/read receipts), groups (list, files, members, chat), reviews (filters, post, reactions, comments,
moderation), tasks, projects, leaderboard, notifications, meetings records + honest "not configured" states, owner
controls (15 sections), invites, reports, permanent delete, cleanup jobs, integrity checks (zero rows), both themes,
both languages, installable PWA.

## Known gaps at baseline (to fix in this audit)
1. Registration promoted the first account to OWNER. Spec: new accounts are always Member.
2. No registration-mode setting (invite only / open / open with approval).
3. Permission capability names did not match the master matrix (`delete_messages`, `pin_messages`, …).
4. No global search screen.
5. No upload rate limit.
6. `FINAL_FIXES.sql`, `PERMISSION_TESTS.md`, `FINAL_AUDIT.md`, `PROGRESS.md` did not exist.
