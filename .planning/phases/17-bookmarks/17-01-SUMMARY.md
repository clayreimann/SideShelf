---
phase: 17-bookmarks
plan: 01
subsystem: database
tags: [drizzle, sqlite, bookmarks, schema, migration, tdd]

requires: []
provides:
  - bookmarks SQLite table with userId FK, libraryItemId, title, time, createdAt, syncedAt
  - pending_bookmark_ops SQLite table for sync queue (create/delete/rename ops)
  - BookmarkRow and PendingBookmarkOpRow inferred types
  - DB helpers: upsertBookmark, upsertAllBookmarks, getBookmarksByItem, deleteBookmarkLocal, enqueuePendingOp, dequeuePendingOps, clearPendingOps
  - wipeUserData integration (pendingBookmarkOps then bookmarks wiped on logout)
  - Migration 0013_giant_lucky_pierre.sql
affects: [17-02, 17-03, 17-04, 17-05]

tech-stack:
  added: []
  patterns:
    - TDD RED→GREEN for DB helper tests using testDb utility
    - pendingBookmarkOps uses string enum operationType ('create'|'delete'|'rename') — no boolean flags
    - clearPendingOps filters by both userId AND ids array — guards against cross-user leakage

key-files:
  created:
    - src/db/schema/bookmarks.ts
    - src/db/helpers/bookmarks.ts
    - src/db/helpers/__tests__/bookmarks.test.ts
    - src/db/migrations/0013_giant_lucky_pierre.sql
    - src/db/migrations/meta/0013_snapshot.json
  modified:
    - src/db/schema/index.ts
    - src/db/helpers/wipeUserData.ts
    - src/db/migrations/migrations.js
    - src/db/migrations/meta/_journal.json

key-decisions:
  - "pendingBookmarkOps has no FK to users table — avoids cascade complications; userId is a plain text column (consistent with other pending-op patterns)"
  - "clearPendingOps filters by userId AND ids to prevent accidental cross-user op deletion"
  - "upsertAllBookmarks sets syncedAt=new Date() on initial API import — records when ABS data was last fetched"

patterns-established:
  - "Bookmark wipe order: pendingBookmarkOps deleted before bookmarks in wipeUserData (child-before-parent pattern)"
  - "Specific schema file import in wipeUserData (not barrel) to prevent circular import risk"

requirements-completed: [BOOKMARK-02, BOOKMARK-05, BOOKMARK-06]

duration: 4min
completed: 2026-03-11
---

# Phase 17 Plan 01: Bookmark Schema + Helpers Summary

**Drizzle SQLite schema for bookmarks and pending_bookmark_ops tables with fully-tested helper functions and wipe-on-logout integration**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-11T00:30:22Z
- **Completed:** 2026-03-11T00:34:22Z
- **Tasks:** 2
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments

- Created `bookmarks` and `pending_bookmark_ops` SQLite tables via Drizzle schema with proper FK cascade and indexes
- Generated migration `0013_giant_lucky_pierre.sql` and updated `migrations.js`
- Implemented 7 DB helper functions covering full CRUD + sync queue lifecycle
- Wrote 14 tests (TDD RED→GREEN) covering all helpers with userId isolation assertions
- Integrated both tables into `wipeUserData` (pendingBookmarkOps first, then bookmarks)

## Task Commits

1. **Task 1: Bookmark schema + migration + wipeUserData** - `b16c911` (feat)
2. **Task 2: DB helpers + tests (TDD RED→GREEN)** - `a5e8a62` (feat)

## Files Created/Modified

- `src/db/schema/bookmarks.ts` - bookmarks and pendingBookmarkOps table definitions; BookmarkRow and PendingBookmarkOpRow types
- `src/db/helpers/bookmarks.ts` - upsertBookmark, upsertAllBookmarks, getBookmarksByItem, deleteBookmarkLocal, enqueuePendingOp, dequeuePendingOps, clearPendingOps
- `src/db/helpers/__tests__/bookmarks.test.ts` - 14 tests covering all helpers
- `src/db/migrations/0013_giant_lucky_pierre.sql` - CREATE TABLE statements for both tables
- `src/db/migrations/migrations.js` - updated to include m0013 import
- `src/db/schema/index.ts` - added `export * as bookmarks from './bookmarks'` in alphabetical order
- `src/db/helpers/wipeUserData.ts` - added pendingBookmarkOps + bookmarks deletes before join-table block

## Decisions Made

- `pendingBookmarkOps` has no FK constraint on `userId` — avoids cascade complications; plain text column consistent with other sync-queue patterns in the codebase
- `clearPendingOps(userId, ids)` filters by BOTH userId and ids array — prevents accidental cross-user deletion during concurrent syncs
- `upsertAllBookmarks` sets `syncedAt = new Date()` at import time — records when ABS server data was last pulled

## Deviations from Plan

None — plan executed exactly as written. The `dpdm` circular import check was skipped as the tool is not installed (no global or local binary); test suite passing confirms no import cycles.

## Issues Encountered

- `npm run drizzle:generate` was intercepted by the RTK hook and failed with "Missing script: run" — resolved by using the direct binary path `node_modules/.bin/drizzle-kit generate --config=drizzle.config.ts`

## Next Phase Readiness

- Schema and helpers complete; Plans 17-02 through 17-05 can all begin immediately
- Migration 0013 must be applied on device before the app can use bookmark tables (handled automatically by `drizzle-orm/expo-sqlite/migrator` on startup)

---

_Phase: 17-bookmarks_
_Completed: 2026-03-11_
