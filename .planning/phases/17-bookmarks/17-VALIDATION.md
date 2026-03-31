---
phase: 17
slug: bookmarks
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                |
| ---------------------- | ---------------------------------------------------- |
| **Framework**          | Jest + jest-expo preset                              |
| **Config file**        | `jest.config.js` (root)                              |
| **Quick run command**  | `jest src/db/helpers/__tests__/bookmarks.test.ts -x` |
| **Full suite command** | `npm test`                                           |
| **Estimated runtime**  | ~30 seconds                                          |

---

## Sampling Rate

- **After every task commit:** Run `jest src/db/helpers/__tests__/bookmarks.test.ts -x` (or closest test to changed code)
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement                           | Test Type               | Automated Command                                                                       | File Exists | Status     |
| -------- | ---- | ---- | ------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- | ----------- | ---------- |
| 17-01-01 | 01   | 0    | BOOKMARK-02, BOOKMARK-05, BOOKMARK-06 | unit                    | `jest src/db/helpers/__tests__/bookmarks.test.ts -x`                                    | ❌ W0       | ⬜ pending |
| 17-01-02 | 01   | 0    | BOOKMARK-03, BOOKMARK-04              | unit                    | `jest src/stores/slices/__tests__/userProfileSlice.test.ts -x`                          | ❌ W0       | ⬜ pending |
| 17-02-01 | 02   | 1    | BOOKMARK-02, BOOKMARK-06              | unit                    | `jest src/db/helpers/__tests__/bookmarks.test.ts -x`                                    | ❌ W0       | ⬜ pending |
| 17-02-02 | 02   | 1    | BOOKMARK-05                           | unit                    | `jest src/db/helpers/__tests__/bookmarks.test.ts -x`                                    | ❌ W0       | ⬜ pending |
| 17-03-01 | 03   | 1    | BOOKMARK-03, BOOKMARK-04              | unit                    | `jest src/stores/slices/__tests__/userProfileSlice.test.ts -x`                          | ❌ W0       | ⬜ pending |
| 17-03-02 | 03   | 1    | BOOKMARK-05, BOOKMARK-06              | unit                    | `jest src/stores/slices/__tests__/userProfileSlice.test.ts -x`                          | ❌ W0       | ⬜ pending |
| 17-03-03 | 03   | 2    | BOOKMARK-06                           | unit (drain on restore) | `jest src/stores/slices/__tests__/networkSlice.test.ts -x --no-coverage`                | ❌ W0       | ⬜ pending |
| 17-04-01 | 04   | 3    | BOOKMARK-01                           | unit (branching logic)  | `jest src/app/FullScreenPlayer/__tests__/handleCreateBookmark.test.ts -x --no-coverage` | ❌ W0       | ⬜ pending |
| 17-04-02 | 04   | 3    | BOOKMARK-01                           | unit (first-tap alert)  | `jest src/app/FullScreenPlayer/__tests__/handleCreateBookmark.test.ts -x --no-coverage` | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/db/helpers/__tests__/bookmarks.test.ts` — stubs covering BOOKMARK-02 (`getBookmarksByItem`), BOOKMARK-05 (offline enqueue), BOOKMARK-06 (SQLite fallback)
- [ ] `src/stores/slices/__tests__/userProfileSlice.test.ts` additions — extend existing file for BOOKMARK-03 (rename), BOOKMARK-04 (delete URL fix)
- [ ] `src/stores/slices/__tests__/networkSlice.test.ts` — stubs for drain-on-restore assertion (BOOKMARK-06 network wiring)
- [ ] `src/app/FullScreenPlayer/__tests__/handleCreateBookmark.test.ts` — stubs for BOOKMARK-01 (add bookmark handler + first-tap preference alert + auto/prompt/long-press branching)
- [ ] Drizzle migration — generated via `npm run drizzle:generate` after bookmarks schema added

---

## Manual-Only Verifications

| Behavior                                           | Requirement              | Why Manual                                              | Test Instructions                                                                    |
| -------------------------------------------------- | ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| BookmarksSection visible in item detail screen     | BOOKMARK-02              | UI rendering requires Expo simulator                    | Open any item detail, verify Bookmarks section renders with correct timestamp format |
| Rename and delete from item detail UI              | BOOKMARK-03, BOOKMARK-04 | ActionSheetIOS / Alert require real device or simulator | Long-press bookmark, verify rename/delete options appear and update correctly        |
| Offline: bookmarks visible when server unreachable | BOOKMARK-06              | Network mocking requires device                         | Enable airplane mode after sync, open item detail, verify bookmarks load from SQLite |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
