# Baseline 2 — after the final audit

| Check | Before (BASELINE.md) | After |
| --- | --- | --- |
| `npx next typegen` | pass | pass |
| `tsc --noEmit` | 0 errors | 0 errors |
| `npm run build` | pass | pass |
| `build_and_start` + `/api/health` | `{"ok":true}` | `{"ok":true}` |
| Permission matrix (`scripts/permission-tests.mjs`) | 25/28 cells, 3 failures (member send blocked by setup, owner delete 500 on malformed id, own permanent delete 422) | **31/31 PASS** (28 matrix rows + 3 setup checks) |
| Registration role | first account OWNER | always MEMBER |
| Registration modes | none | open · invite only · open with approval (all verified) |
| Global search | missing | built and verified (`/api/search`, `/search`) |
| Malformed id handling | 500 | 422/404 |
| Upload rate limit | none | 40 per 10 min |
| Database | 1 Owner, 8 seeded groups | 1 Owner, 8 seeded groups, no audit accounts left |
| Integrity checks | zero rows | zero rows |
| `npm run lint` | 27 errors (style rules), 30 warnings | **0 errors**, 57 warnings (rules kept visible, documented in the config) |

Routes added: `/search`. Routes changed: registration (invite code), owner invites section (registration settings and
approvals). No route was removed.
