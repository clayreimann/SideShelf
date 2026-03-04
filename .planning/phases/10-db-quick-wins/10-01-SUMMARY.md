---
phase: 10-db-quick-wins
plan: "01"
subsystem: database
tags: [sqlite, drizzle, wal, indexes, error-handling]

requires: []

provides:
  - WAL journal mode + synchronous=NORMAL set on every SQLite open via getSQLiteDb()
  - Four FK indexes on library_items.library_id, media_metadata.library_item_id, audio_files.media_id, media_progress(user_id, library_item_id)
  - Migration 0012_hot_stellaris.sql applying all four indexes
  - DbErrorScreen blocking error component with Share-based copy and context-aware reset
  - DbProvider guard that prevents children from rendering when migration error is non-null

affects: [11-useeffect-cleanup-state-centralization, 12-service-decomposition]

tech-stack:
  added: []
  patterns:
    - "WAL pragma via execSync before Drizzle wraps connection — set inside getSQLiteDb() if(!sqliteDb) guard"
    - "Blocking error screen pattern: provider returns <ErrorScreen> on unrecoverable error, null while loading"
    - "Context-aware error UI: disk-full errors suppress reset button (resetting won't help)"
    - "Drizzle index via sqliteTable 3rd argument — never raw CREATE INDEX SQL"

key-files:
  created:
    - src/components/errors/DbErrorScreen.tsx
    - src/db/migrations/0012_hot_stellaris.sql
  modified:
    - src/db/client.ts
    - src/providers/DbProvider.tsx
    - src/db/schema/libraryItems.ts
    - src/db/schema/mediaMetadata.ts
    - src/db/schema/audioFiles.ts
    - src/db/schema/mediaProgress.ts

key-decisions:
  - "WAL pragma uses execSync (raw SQLite handle) not db.run(sql`PRAGMA`) — must run before Drizzle wraps connection"
  - "synchronous=NORMAL is connection-level (must set each open); WAL is persistent (survives restarts) — both set in getSQLiteDb() guard"
  - "DbErrorScreen uses basic RN primitives (View/Text/Pressable/ScrollView) — no themed UI components, safe when main DB is broken"
  - "disk-full error check via error.message.toLowerCase() — hides reset button since resetting won't free space"
  - "useMemo placed before early returns in DbProvider to comply with React hooks ordering rules"

patterns-established:
  - "Blocking provider pattern: useMemo before early returns; conditional render uses useMemo result"

requirements-completed: [DB-01, DB-02, DB-03, DB-04, DB-05]

duration: 4min
completed: 2026-03-04
---

# Phase 10 Plan 01: DB Quick Wins Summary

**WAL journal mode + 4 FK indexes via Drizzle schema declarations + blocking DbErrorScreen replacing silent-continue on migration failure**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T12:22:36Z
- **Completed:** 2026-03-04T12:27:06Z
- **Tasks:** 2
- **Files modified:** 8 (3 modified + 1 created in Task 1; 4 modified + 2 generated in Task 2)

## Accomplishments

- WAL mode and synchronous=NORMAL now set on every DB open (including post-reset) via `getSQLiteDb()` — eliminates write contention during ProgressService syncs
- Four missing FK indexes added to schema files and applied via generated migration (0012_hot_stellaris.sql) — eliminates table scans on the four most-queried foreign-key paths
- DbProvider now renders a blocking `DbErrorScreen` when migration fails — children never mount with a broken database

## Task Commits

Each task was committed atomically:

1. **Task 1: WAL pragma + DbProvider blocking error screen** - `9caf602` (feat)
2. **Task 2: Index declarations in 4 schema files + generate migration** - `3c1645b` (feat)

**Plan metadata:** (docs commit — see final_commit below)

## Files Created/Modified

- `src/db/client.ts` - Added `execSync("PRAGMA journal_mode=WAL;")` and `execSync("PRAGMA synchronous=NORMAL;")` inside `getSQLiteDb()` if-guard
- `src/components/errors/DbErrorScreen.tsx` - New blocking error screen with Share copy button and conditional reset (disk-full aware)
- `src/providers/DbProvider.tsx` - Imports DbErrorScreen + logger; renders error screen on migration failure; returns null while loading
- `src/db/schema/libraryItems.ts` - Added `index` import and `library_items_library_id_idx` on `libraryId`
- `src/db/schema/mediaMetadata.ts` - Added `index` import and `media_metadata_library_item_id_idx` on `libraryItemId`
- `src/db/schema/audioFiles.ts` - Added `index` import and `audio_files_media_id_idx` on `mediaId`
- `src/db/schema/mediaProgress.ts` - Added `index` import and `media_progress_user_library_idx` composite on `(userId, libraryItemId)`
- `src/db/migrations/0012_hot_stellaris.sql` - Generated migration with 4 `CREATE INDEX` statements

## Decisions Made

- WAL pragma uses `execSync` on the raw SQLite handle before Drizzle wraps the connection — `db.run(sql\`PRAGMA\`)` would bypass the connection-level requirement
- `useMemo` placed before early returns in `DbProvider` to comply with React hooks ordering rules (hooks must be called unconditionally)
- `DbErrorScreen` uses basic React Native primitives only (no themed UI components) — safe to render when `abs2.sqlite` itself is broken
- Disk-full detection via `error.message.toLowerCase()` check for "no space", "disk full", "enospc" — reset button hidden in this case since resetting won't reclaim storage

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- DB infrastructure improvements complete; WAL mode and indexes will apply automatically on next app open
- Migration 0012 will run on next cold start for all users
- Phase 10, Plan 02 (batch upsert N+1 fixes) can proceed immediately

---

_Phase: 10-db-quick-wins_
_Completed: 2026-03-04_

## Self-Check: PASSED

- src/db/client.ts: FOUND
- src/components/errors/DbErrorScreen.tsx: FOUND
- src/providers/DbProvider.tsx: FOUND
- src/db/migrations/0012_hot_stellaris.sql: FOUND
- 10-01-SUMMARY.md: FOUND
- Commit 9caf602 (Task 1): FOUND
- Commit 3c1645b (Task 2): FOUND
