---
phase: 18-sleep-timer-fade-navigation-path-standardization
plan: "04"
subsystem: navigation, database-migrations
tags: [deep-links, path-normalization, scheme-change, sql-migration, navigation]

# Dependency graph
requires: [18-01]
provides:
  - "handleDeepLinkUrl() in src/lib/deepLinkHandler.ts — standalone testable deep link router"
  - "sideshelf:// URL scheme registered in app.json and app.config.js"
  - "0014_normalize_paths.sql — strips file:// prefix and decodes %20/%28/%29 from DB paths"
affects:
  - "_layout.tsx deep link handling — sideshelf:// dispatched to handleDeepLinkUrl"
  - "All existing DB rows with file:// prefixed paths — cleaned at migration run time"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deep link handler extraction: standalone lib function reads store state directly via useAppStore.getState()"
    - "Deep link wiring: handleDeepLinkUrl called from _layout.tsx handleDeepLink before unknown-link warn"
    - "SQL migration pattern: 6 UPDATE passes (3 strip file://, 3 decode %-encoding) across 3 tables"

key-files:
  created:
    - src/lib/deepLinkHandler.ts
    - src/db/migrations/0014_normalize_paths.sql
  modified:
    - src/app/_layout.tsx
    - app.json
    - app.config.js
    - src/db/migrations/migrations.js

key-decisions:
  - "handleDeepLinkUrl reads auth/player state from useAppStore.getState() directly — no parameter injection needed; matches test mock pattern"
  - "sideshelf:// branch added before unknown-link warn in _layout.tsx — existing bundle-loader and logger handlers unchanged"
  - "slug field (side-shelf) left unchanged in both config files — only the scheme field was updated to sideshelf"
  - "SQL migration uses SUBSTR(path, 8) to strip file:// prefix (7 chars + 1 for 1-based indexing)"
  - "Percent-encoding pass uses WHERE LIKE '%\\%%' ESCAPE '\\' to only update rows that still contain % after file:// strip"

# Metrics
duration: ~15min
completed: 2026-03-17
---

# Phase 18 Plan 04: Deep Link Handler + Path Normalization Migration Summary

**sideshelf:// deep link routing extracted to standalone testable handler; 0014 SQL migration strips file:// prefix and decodes percent-encoding across three download tables**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-03-17
- **Tasks:** 2 of 2
- **Files modified:** 6

## Accomplishments

### Task 1: Deep Link Handler + Scheme Change

- Created `src/lib/deepLinkHandler.ts` exporting `handleDeepLinkUrl(url: string)` — pure function reads auth/player state from Zustand store
- Handles: home/library/series/authors/more tab routes, item/[ID] deep links, resume/play-pause player actions, unauthenticated redirect to login, unknown scheme no-op
- Added `sideshelf://` branch in `_layout.tsx` `handleDeepLink()` before the unknown-link fallback
- Updated `app.json` and `app.config.js` scheme from `side-shelf` to `sideshelf`
- All 13 deepLinkHandler tests GREEN

### Task 2: Path Normalization SQL Migration (DEBT-01)

- Created `src/db/migrations/0014_normalize_paths.sql` with 6 UPDATE statements
- Pass 1 (3 statements): strips `file://` prefix from `local_audio_file_downloads`, `local_library_file_downloads`, and `local_cover_cache`
- Pass 2 (3 statements): decodes `%20` → space, `%28` → `(`, `%29` → `)` in all three tables
- Registered `m0014` import and entry in `src/db/migrations/migrations.js`
- All 6 normalizePaths tests GREEN

## Task Commits

| Task | Name                              | Commit    | Files                                                     |
| ---- | --------------------------------- | --------- | --------------------------------------------------------- |
| 1    | Deep link handler + scheme change | `866ab48` | deepLinkHandler.ts, \_layout.tsx, app.json, app.config.js |
| 2    | Path normalization SQL migration  | `d48eeec` | 0014_normalize_paths.sql, migrations.js                   |

## Files Created/Modified

- `src/lib/deepLinkHandler.ts` — standalone deep link router; exports `handleDeepLinkUrl()`; reads auth + player state from `useAppStore.getState()`
- `src/app/_layout.tsx` — added `import { handleDeepLinkUrl }` and `sideshelf://` dispatch branch
- `app.json` — scheme changed to `sideshelf`
- `app.config.js` — scheme changed to `sideshelf`
- `src/db/migrations/0014_normalize_paths.sql` — 6 UPDATE statements cleaning legacy DB paths
- `src/db/migrations/migrations.js` — m0014 import and entry added

## Decisions Made

- `handleDeepLinkUrl` reads auth state via `useAppStore.getState().auth.isAuthenticated` — no `isAuthenticated` parameter in function signature (tests mock `useAppStore.getState` directly, simpler interface)
- The `slug` field (`side-shelf`) in both config files was intentionally left unchanged — slug is a separate concept from URL scheme
- SQL migration SUBSTR offset is 8 (file:// = 7 chars, but SQLite SUBSTR is 1-based, so position 8 = first char after `file://`)
- Percent-encoding decode pass uses `WHERE LIKE '%\%%' ESCAPE '\'` guard to avoid touching already-clean paths

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/lib/deepLinkHandler.ts
- FOUND: src/db/migrations/0014_normalize_paths.sql
- Commits 866ab48 (task 1) and d48eeec (task 2) present in git log
- 13 deepLinkHandler tests GREEN
- 6 normalizePaths tests GREEN
- Only pre-existing RED stubs (PlayerBackgroundServiceFade — Plan 03 scope) remain failing

---

_Phase: 18-sleep-timer-fade-navigation-path-standardization_
_Completed: 2026-03-17_
