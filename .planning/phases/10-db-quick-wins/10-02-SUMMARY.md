---
phase: 10-db-quick-wins
plan: "02"
subsystem: database
tags: [drizzle-orm, sqlite, batch-upsert, n+1, performance, onConflictDoUpdate]

# Dependency graph
requires:
  - phase: 10-01
    provides: WAL pragma, 4 FK indexes, DbErrorScreen — DB foundation for this phase
provides:
  - Batch upsertLibraryItems using single INSERT ON CONFLICT DO UPDATE
  - Batch upsertLibraries using single INSERT ON CONFLICT DO UPDATE
  - Batch upsertAuthors using single INSERT ON CONFLICT DO UPDATE
  - Batch upsertMultipleSeries using single INSERT ON CONFLICT DO UPDATE
  - Batch upsertMediaProgress using single INSERT ON CONFLICT DO UPDATE
  - Batch upsertAudioFiles using single INSERT ON CONFLICT DO UPDATE (transaction wrapper removed)
  - Batch upsertChapters using single INSERT ON CONFLICT DO UPDATE (transaction wrapper removed)
  - Batch upsertLibraryFiles using single INSERT ON CONFLICT DO UPDATE (transaction wrapper removed)
  - Batch upsertGenres/Narrators/Tags using single INSERT ON CONFLICT DO NOTHING with try/catch
  - All processFullLibraryItem transaction inner loops (authors, series, audioFiles, chapters, libraryFiles) batched
  - Behavioral batch assertions: libraryItems.test.ts + fullLibraryItems.test.ts
affects: [11-useeffect-cleanup-state-centralization, 12-service-decomposition]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Batch upsert: db.insert(table).values(rows).onConflictDoUpdate({ target, set: { col: sql`excluded.col_name` } })"
    - "sql`excluded.snake_case_column_name` — not camelCase TypeScript property name"
    - "Reference data upsert: onConflictDoNothing with try/catch (genres, narrators, tags)"
    - "Single-row helpers (upsertLibraryItem, upsertChapter, etc.) kept for callers that need single-row semantics"
    - "upsertLibraryItemTx removed — zero callers outside its own file"

key-files:
  created:
    - src/db/helpers/__tests__/libraryItems.test.ts
    - src/db/helpers/__tests__/fullLibraryItems.test.ts
  modified:
    - src/db/helpers/libraryItems.ts
    - src/db/helpers/libraries.ts
    - src/db/helpers/authors.ts
    - src/db/helpers/series.ts
    - src/db/helpers/mediaProgress.ts
    - src/db/helpers/audioFiles.ts
    - src/db/helpers/chapters.ts
    - src/db/helpers/libraryFiles.ts
    - src/db/helpers/fullLibraryItems.ts

key-decisions:
  - "sql`excluded.col_name` uses SQL snake_case column names (not TypeScript camelCase properties) — verified against schema"
  - "upsertGenres/Narrators/Tags wrapped in try/catch: reference data failures should not abort full library item upsert"
  - "audioFiles/chapters/libraryFiles transaction wrappers removed — single INSERT is already atomic"
  - "upsertLibraryItemTx removed after confirming zero callers outside libraryItems.ts"
  - "Behavioral tests assert row counts (not internal call counts) — outcome-based, not implementation-coupled"

patterns-established:
  - "Batch upsert pattern: values(rows).onConflictDoUpdate({ target: table.id, set: { col: sql`excluded.col` } })"
  - "Reference table batch upsert: values(names.map(name => ({ name }))).onConflictDoNothing()"
  - "Transaction inner loops → replaced with single values(rows) call inside same transaction"

requirements-completed: [DB-06, DB-07]

# Metrics
duration: 12min
completed: 2026-03-04
---

# Phase 10 Plan 02: N+1 Batch Upsert Elimination Summary

**All 9 helper files converted from per-row for-loops to single-statement `INSERT ON CONFLICT DO UPDATE`, eliminating ~1,000+ sequential queries for a 500-item library sync**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-04T12:31:59Z
- **Completed:** 2026-03-04T12:43:59Z
- **Tasks:** 2
- **Files modified:** 11 (9 helpers + 2 new test files)

## Accomplishments

- All 8 batch upsert helper functions converted to single-statement INSERT ON CONFLICT DO UPDATE — a 500-item library sync drops from ~1,000+ sequential queries to a handful of batch statements
- processFullLibraryItem inner loops (authors, series, audioFiles, chapters, libraryFiles) all batched within their respective transactions
- upsertGenres/Narrators/Tags converted to single-statement INSERT ON CONFLICT DO NOTHING with try/catch error isolation
- Two new test files with 16 behavioral assertions covering batch insert correctness, empty-array safety, idempotency, and null safety
- upsertLibraryItemTx removed (zero callers confirmed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing batch assertion tests** - `b1d5487` (test)
2. **Task 2: Batch-convert all N+1 upsert helpers** - `7bc002b` (feat)

**Plan metadata:** (this commit — docs)

## Files Created/Modified

- `src/db/helpers/__tests__/libraryItems.test.ts` - Behavioral assertions: insert N rows, empty guard, idempotency, null safety
- `src/db/helpers/__tests__/fullLibraryItems.test.ts` - Behavioral assertions for upsertGenres/Narrators/Tags: batch correctness, conflict idempotency, null safety
- `src/db/helpers/libraryItems.ts` - upsertLibraryItems converted to batch; upsertLibraryItemTx removed
- `src/db/helpers/libraries.ts` - upsertLibraries converted to batch; sql import added
- `src/db/helpers/authors.ts` - upsertAuthors converted to batch; sql import added
- `src/db/helpers/series.ts` - upsertMultipleSeries converted to batch; sql import added
- `src/db/helpers/mediaProgress.ts` - upsertMediaProgress converted to batch (for-loop removed); sql import added
- `src/db/helpers/audioFiles.ts` - upsertAudioFiles converted to batch; transaction wrapper removed; sql import added
- `src/db/helpers/chapters.ts` - upsertChapters converted to batch; transaction wrapper removed; sql import added
- `src/db/helpers/libraryFiles.ts` - upsertLibraryFiles converted to batch; transaction wrapper removed; sql import added
- `src/db/helpers/fullLibraryItems.ts` - upsertGenres/Narrators/Tags batched with try/catch; all 5 Transaction 2/3/4 inner loops batched; sql import added

## Decisions Made

- `sql\`excluded.col_name\``uses SQL snake_case column names (e.g.,`excluded.library_id`), not TypeScript camelCase (`excluded.libraryId`) — verified `tagASIN`maps to`tag_asin`(not`tag_a_s_i_n`) by reading the schema
- upsertGenres/Narrators/Tags wrapped in try/catch per plan guidance: reference data failures should not abort the full item upsert in processFullLibraryItem
- audioFiles, chapters, libraryFiles transaction wrappers removed — a single INSERT statement is already atomic; no wrapping needed
- upsertLibraryItemTx removed after codebase search confirmed zero callers outside its own file
- Behavioral tests use row count assertions (not jest.spyOn call counts) — cleaner and doesn't couple tests to implementation

## Deviations from Plan

None - plan executed exactly as written. The `tagASIN` column name check (found `tag_asin` not `tag_a_s_i_n`) was a normal implementation detail caught by reading the schema, not a deviation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- N+1 upsert elimination complete — library sync is now highly efficient for any library size
- All tests green (535 passed, 3 pre-existing skipped)
- Phase 10 complete — ready for Phase 11: useEffect Cleanup + State Centralization

---

_Phase: 10-db-quick-wins_
_Completed: 2026-03-04_
