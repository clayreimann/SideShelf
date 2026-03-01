---
phase: 09-navigation-ui-polish
plan: "03"
subsystem: ui
tags: [cover-art, startup, background-scan, fire-and-forget, circular-dependency]

# Dependency graph
requires:
  - phase: 08-skip-player-polish
    provides: partial cover art fix in PlayerService; getCoverUri() always returns current path
provides:
  - "repairMissingCoverArt() exported from src/lib/covers.ts"
  - "Fire-and-forget startup cover scan wired into initializeApp()"
affects: [PlayerService, executeLoadTrack, lock-screen-cover-art]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import inside async function to break circular dependency (covers.ts -> mediaMetadata.ts -> covers.ts)"
    - "Fire-and-forget startup scan pattern: .catch() without await, alongside applyICloudExclusionToExistingDownloads"

key-files:
  created: []
  modified:
    - src/lib/covers.ts
    - src/index.ts

key-decisions:
  - "Dynamic imports (import()) inside repairMissingCoverArt() body to avoid circular dependency: mediaMetadata.ts statically imports covers.ts, so covers.ts cannot statically import mediaMetadata.ts"
  - "Lock screen NOT updated after cover download — executeLoadTrack calls getCoverUri() at track load time, cover correct on next playback; coupling to player state for immediate refresh would be unnecessary"
  - "Placed fire-and-forget call alongside applyICloudExclusionToExistingDownloads (both are startup scans with same non-blocking pattern)"
  - "Per-item errors swallowed via .catch(() => false) — cacheCoverAndUpdateMetadata already logs; outer error re-thrown for caller's .catch() logging"

patterns-established:
  - "Startup scan pattern: fire-and-forget with .catch() in initializeApp(), no await, log via log.warn on rejection"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 09 Plan 03: Startup Cover Art Repair Summary

**Background scan on app startup re-downloads missing cover files for all library items using dynamic imports to avoid circular dependency between covers.ts and mediaMetadata helper**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T01:39:34Z
- **Completed:** 2026-02-28T01:41:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `repairMissingCoverArt()` exported function to `src/lib/covers.ts` — queries all `mediaMetadata` rows, filters by `isCoverCached()`, downloads missing covers in batches of 5
- Wired `repairMissingCoverArt().catch()` fire-and-forget into `initializeApp()` in `src/index.ts`, alongside the existing `applyICloudExclusionToExistingDownloads` scan
- Resolved circular dependency: `mediaMetadata.ts` statically imports `covers.ts`; dynamic imports inside function body avoid the cycle

## Task Commits

Each task was committed atomically:

1. **Task 1: Add repairMissingCoverArt() to src/lib/covers.ts** - `1da2fd5` (feat) — note: bundled with phase 09-01 commit due to pre-staged state
2. **Task 2: Wire repairMissingCoverArt into initializeApp() as fire-and-forget** - `f5c31b2` (feat)

## Files Created/Modified

- `src/lib/covers.ts` - Added `repairMissingCoverArt()` at end of file with dynamic imports, batch download logic, per-item error swallowing
- `src/index.ts` - Added import and fire-and-forget `.catch()` call in `initializeApp()` after iCloud exclusion scan

## Decisions Made

**Dynamic imports in repairMissingCoverArt():** `mediaMetadata.ts` already statically imports `cacheCoverIfMissing`, `getCoverUri`, and `isCoverCached` from `covers.ts`. Adding a static import of `cacheCoverAndUpdateMetadata` in `covers.ts` would create a circular dependency. The plan specified dynamic `import()` inside the function body — same pattern used elsewhere in the codebase for this concern.

**No lock screen update after download:** After a cover is downloaded by the repair scan, `updateNowPlayingMetadata()` is NOT called. The `executeLoadTrack()` path in `PlayerService.ts` calls `getCoverUri()` at track load time, which always returns the current (valid) path. Cover art will be correct the next time the user starts playback. Calling `updateNowPlayingMetadata()` from the scan would require knowing the currently-playing item and would couple the scan to player state — unnecessary coupling with no UX benefit since the lock screen only matters during active playback.

**Placement in initializeApp():** Call is placed immediately after `applyICloudExclusionToExistingDownloads()` — both are fire-and-forget startup scans with identical non-blocking patterns. Placing it early ensures the cover downloads begin while the rest of initialization continues; player restoration happens after, so covers are likely ready by first play.

**Error handling:** Per-item errors are swallowed via `.catch(() => false)` inside `cacheCoverAndUpdateMetadata` which already logs. The outer try/catch re-throws so the `.catch()` in `initializeApp()` receives the error for logging via `log.warn`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Task 1 commit bundled with prior plan's commit:** The `repairMissingCoverArt` function was added to `covers.ts` but was already staged/committed as part of the `1da2fd5` commit (from phase 09-01 execution that had pre-staged `covers.ts` changes). The lint-staged hook prevented an empty commit for the standalone Task 1 commit attempt. The code is correctly in HEAD; the Task 2 commit `f5c31b2` is standalone and correct.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Cover art repair scan is complete and wired in; first-boot lock screen cover gap is fixed
- Remaining Phase 9 plans: 09-02 (more screen navigation) and any other polish items
- No blockers for next plan

---

_Phase: 09-navigation-ui-polish_
_Completed: 2026-02-28_
