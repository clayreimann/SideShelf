---
phase: 07-download-tracking
plan: 03
subsystem: ui
tags: [storage, orphan-scanner, expo-file-system, useFocusEffect, expo-router]

# Dependency graph
requires:
  - phase: 07-download-tracking/07-01
    provides: downloadSlice, fileLifecycleManager, DB download helpers
provides:
  - "src/lib/orphanScanner.ts — scanForOrphanFiles() walks documents/downloads and caches/downloads, skips active downloads, returns OrphanFile[]"
  - "Storage tab auto-refreshes on every tab focus via useFocusEffect"
  - "Unknown files section in Storage tab showing orphan disk files with filename, size, and tap-to-delete Alert"
affects: [storage-display, download-cleanup, ui-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useFocusEffect replaces useEffect for tab-focus refresh in Storage screen"
    - "Non-fatal try/catch wrapping orphan scan — storage stats always display even if scan fails"

key-files:
  created:
    - src/lib/orphanScanner.ts
  modified:
    - src/app/(tabs)/more/storage.tsx

key-decisions:
  - "Orphan scanner uses both getAllDownloadedAudioFiles() and getAllDownloadedLibraryFiles() to build known-paths set — covers all download types"
  - "URI normalization uses decodeURIComponent with Array.from(knownPaths).some() fallback for robust matching across percent-encoded paths"
  - "scanForOrphanFiles() wrapped in non-fatal try/catch in storage.tsx — orphan detection failure never blocks storage stats display"

patterns-established:
  - "OrphanScanner pattern: walk disk dirs, build known-paths Set from DB, classify unknown files as orphans, skip active downloads"

requirements-completed: [DL-02]

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 07 Plan 03: Storage Tab Orphan Scanner Summary

**orphanScanner.ts walks download directories against DB known-paths to surface unknown disk files in a reactive Storage tab with tap-to-delete support**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-23T20:18:29Z
- **Completed:** 2026-02-23T20:22:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- New `src/lib/orphanScanner.ts` that walks both `documents/downloads` and `caches/downloads`, skips active download directories, and returns `OrphanFile[]` for files with no DB record
- Storage tab now auto-refreshes on every tab focus via `useFocusEffect` (previously only on first mount with `useEffect`)
- "Unknown files" section added to Storage SectionList — renders when orphans exist, shows filename and file size, tap-to-delete Alert removes file from disk and list state

## Task Commits

Each task was committed atomically:

1. **Task 1: Create orphanScanner.ts with disk-walk orphan detection** - `227329d` (feat)
2. **Task 2: Add useFocusEffect refresh and Unknown files section to storage.tsx** - `6213e30` + `0cc29f8` (feat — storage.tsx changes were picked up by lint-staged during a concurrent 07-01 commit, prettier reformatting landed in `0cc29f8`)

## Files Created/Modified

- `src/lib/orphanScanner.ts` — new module; exports `scanForOrphanFiles(): Promise<OrphanFile[]>` and `OrphanFile` interface; walks both download directory locations, skips active download items, normalizes URIs for matching
- `src/app/(tabs)/more/storage.tsx` — replaced `useEffect` with `useFocusEffect`; added `orphanFiles` state; added `scanForOrphanFiles()` call in `refreshStorageStats`; added `deleteOrphanFile` handler; added "Unknown files" SectionList section; added `sublabel` field to `ActionItem` type with display in `renderItem`

## Decisions Made

- Used both `getAllDownloadedAudioFiles()` and `getAllDownloadedLibraryFiles()` (not just `getDownloadedAudioFilesWithLibraryInfo()` from the plan) to ensure library files (PDF attachments, etc.) are also included in the known-paths set
- URI normalization applies `decodeURIComponent` with a `Array.from(knownPaths).some()` fallback for robust matching — handles percent-encoded filenames (spaces, special chars) without false orphan positives

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Include library file download paths in known-paths set**

- **Found during:** Task 1 (creating orphanScanner.ts)
- **Issue:** Plan specified `getDownloadedAudioFilesWithLibraryInfo()` which only covers audio files. Library files (PDFs, etc.) stored via `localLibraryFileDownloads` would always appear as orphans
- **Fix:** Used both `getAllDownloadedAudioFiles()` and `getAllDownloadedLibraryFiles()` to build the complete known-paths set
- **Files modified:** src/lib/orphanScanner.ts
- **Verification:** TypeScript compiles cleanly, all tests pass
- **Committed in:** 227329d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (missing critical completeness fix)
**Impact on plan:** Fix prevents false orphan positives for library file downloads. No scope creep.

## Issues Encountered

- Pre-commit lint-staged hook processed `storage.tsx` during a concurrent task's commit (07-01 plan was also being worked on in the same session). The bulk of storage.tsx changes landed in commit `6213e30`, with only a prettier reformatting in `0cc29f8`. All changes are correctly committed to the branch.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DL-02 requirement is complete: Storage tab accurately reflects disk reality (auto-refreshes, shows orphan files)
- Phase 07 is now complete (all 3 plans: DL-01 download reconciliation, DL-02 storage tab reactive + orphan scanner, wait — plan 01 covered both DL-01 and DL-02 partially; plan 03 completes DL-02)
- Ready for Phase 08 (Now Playing metadata updates)

---

_Phase: 07-download-tracking_
_Completed: 2026-02-23_
