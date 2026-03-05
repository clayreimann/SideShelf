---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: — Tech Cleanup
status: in_progress
stopped_at: "Completed 13-01-PLAN.md (checkpoint approved — ready for 13-02)"
last_updated: "2026-03-05T14:00:00.000Z"
last_activity: 2026-03-05 — Plan 13-01 COMPLETE — human approved rnbd-fork-diff.md checkpoint, SUMMARY.md created, proceeding to 13-02
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.
**Current focus:** v1.2 Tech Cleanup — Phase 12: Service Decomposition COMPLETE — Phase 13: RN Downloader Migration up next

## Current Position

Phase: 13 of 13 (RN Downloader Migration) — IN PROGRESS
Plan: 2 of 2 in current phase — READY (Plan 13-01 complete and checkpoint approved, proceeding to 13-02)
Status: Phase 13 in progress — DWNLD-01 satisfied, human verified rnbd-fork-diff.md, ready to begin 13-02
Last activity: 2026-03-05 — Plan 13-01 fully complete (investigation document approved at checkpoint, SUMMARY.md created)

Progress: [█████████░] 89%

## Performance Metrics

**Velocity (v1.0):**

- Total plans completed: 16 (Phases 2–5 including 03.1)
- Total execution time: ~1 month

**Velocity (v1.1):**

- Total plans completed: 11 (Phases 6–9)
- Total execution time: 6 days (Feb 22 → Feb 27)

**v1.2 (in progress):**

- Plan 10-01: 4 min (2 tasks, 8 files)
- Plan 10-02: 12 min (2 tasks, 11 files)
- Plan 11-01: 8 min (3 tasks, 10 files, 29 new tests)
- Plan 11-02: 90 min (4 tasks, 14 files, 8 new tests)
- Plan 12-01: 33 min (3 tasks [1+2 combined], 13 files, 67 new tests)
- Plan 12-02: 20 min (3 tasks [1+2+3 combined], 7 files, 33 new tests)
- Plan 13-01: 10 min (1 task, 1 file — investigation document)

## Accumulated Context

### Decisions — carried forward to v1.2

Full decision log is in PROJECT.md Key Decisions table.

Key decisions to carry forward:

- observerMode flag preserved for instant rollback — remove only when coordinator stable for 2+ releases
- Long-press interval on skip button is one-time-apply by design — Settings controls the default
- Partial badge (amber, top-left) pattern established for partially-downloaded items

**Phase 10 decisions:**

- WAL pragma uses execSync on raw SQLite handle (before Drizzle wraps connection); synchronous=NORMAL is connection-level so set in getSQLiteDb() guard
- DbErrorScreen uses basic RN primitives only (safe when abs2.sqlite is broken); disk-full errors hide reset button
- useMemo placed before early returns in DbProvider to comply with React hooks ordering rules
- sql`excluded.col_name` uses SQL snake_case column names (not TypeScript camelCase); verified tagASIN maps to tag_asin
- upsertGenres/Narrators/Tags wrapped in try/catch — reference data failures must not abort full item upsert
- upsertLibraryItemTx removed after confirming zero callers outside its own file

**Phase 13 decisions:**

- Investigation document is analysis-only (no proof-of-concept) — API diff is fully deterministic from direct source inspection of fork node_modules and mainline CDN
- No migration flag needed for fork → mainline transition — existing repair/reconciliation flow handles fork-era in-progress downloads correctly; beta app so aggressive cleanup is acceptable
- void prefix on pause/resume/stop is the correct pattern — fire-and-forget is functionally safe, await not required for these best-effort operations

**Phase 12 decisions:**

- IPlayerServiceFacade placed in types.ts — both PlayerService.ts and collaborators import from the same file, preventing circular imports; no collaborator imports from PlayerService.ts
- rebuildCurrentTrackIfNeeded placed in ProgressRestoreCollaborator (owns session restore); exposed on IPlayerServiceFacade so PlaybackControlCollaborator can call it without importing ProgressRestoreCollaborator directly
- BackgroundReconnectCollaborator keeps require() pattern for PlayerBackgroundService per CLAUDE.md pattern (module cache clearing in **DEV** mode)
- forceExit added to jest.config.js — @react-native-community/netinfo starts an internet reachability timer that never unrefs; forceExit fixes lint-staged --bail invocations without changing test behavior
- DownloadService collaborators are stateless (no facade reference) — simpler than PlayerService pattern because they query DB/filesystem independently with no callbacks to facade
- isDownloadActive and getDownloadStatus remain as direct Map reads in DownloadService facade — delegating them would break the activeDownloads isolation goal

**Phase 11 decisions:**

- viewMode uses manual AsyncStorage helper pattern (not Zustand persist middleware) — consistent with all other settings in settingsSlice
- getAuthorById existed in authors.ts; getOrFetchAuthorById uses in-memory find() first, DB fallback logs a warning
- getMediaProgressForItems deduplicates by orderBy(desc(lastUpdate)) + first-row-wins per libraryItemId
- loggerSlice.availableTags populated synchronously via getAllTags() in initialize() and refreshAvailableTags()
- progressMap from seriesSlice is Record type; SeriesDetailScreen converts to Map via useMemo for backward compatibility
- useAppStore.getState() in AuthProvider logout/setServerUrl callbacks is valid — called imperatively after StoreProvider mounts, not during render
- wipeUserData deletes content tables in child-before-parent FK order; preserves users and logger tables
- viewMode/updateViewMode were missing from useSettings() hook despite being in settingsSlice — added as Rule 3 auto-fix

### Pending Todos

None.

### Blockers/Concerns

- DWNLD-01 SATISFIED — fork diff spike complete, rnbd-fork-diff.md committed (e31daa2) and human-approved. Plan 13-02 is unblocked.
- Android `updateMetadataForTrack` artwork bug (#2287) — not verified (no Android device); carry forward
- PERF-01 (`NATIVE_PROGRESS_UPDATED` bypass async-lock) — deferred; needs safety analysis

## Session Continuity

Last session: 2026-03-05T14:00:00.000Z
Stopped at: Completed 13-01-PLAN.md (checkpoint approved — 13-02 ready to begin)
Resume file: None
