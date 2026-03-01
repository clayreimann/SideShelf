---
phase: 07-download-tracking
plan: 01
subsystem: downloads
tags: [react-native, zustand, sqlite, background-downloader, file-system]

# Dependency graph
requires:
  - phase: 06-icloud-exclusion
    provides: iCloud exclusion patterns and fileLifecycleManager structure
provides:
  - runDownloadReconciliationScan() in fileLifecycleManager.ts — stale scan + zombie detection with active-download guard
  - removeDownloadedItem(id) action in downloadSlice
  - partiallyDownloadedItems Set<string> in downloadSlice state
  - Fire-and-forget scan wired into _layout.tsx AppState active handler (both branches)
affects: [07-download-tracking, ui-download-badges, library-item-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget .catch() pattern for non-blocking background scans on foreground resume"
    - "Dynamic import of appStore inside async function body to avoid circular dependency"
    - "isDownloadActive as unified guard for both active and paused downloads (paused items stay in activeDownloads Map)"

key-files:
  created: []
  modified:
    - src/lib/fileLifecycleManager.ts
    - src/stores/slices/downloadSlice.ts
    - src/app/_layout.tsx

key-decisions:
  - "Use isDownloadActive as the single guard — covers both active and paused downloads because paused items remain in the activeDownloads Map"
  - "Dynamic inline import of appStore inside runDownloadReconciliationScan to avoid circular dependency (appStore imports DownloadService)"
  - "Fire-and-forget scan added to BOTH active branches in _layout.tsx so it always runs on foreground resume regardless of playback state"

patterns-established:
  - "Reconciliation scan pattern: iterate DB records, guard with service isActive check, clear missing, invalidate store"
  - "Zombie task cleanup: checkForExistingDownloads, parse task ID via underscore split, stop + delete dirs if untracked"

requirements-completed: [DL-01, DL-03]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 7 Plan 01: Download Reconciliation Scan Summary

**Foreground-resume reconciliation scan that clears stale DB records, stops zombie downloads, and keeps Zustand store in sync — skipping all active and paused downloads via isDownloadActive guard**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-23T20:18:34Z
- **Completed:** 2026-02-23T20:21:28Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `runDownloadReconciliationScan()` to `fileLifecycleManager.ts` with stale record detection, Zustand invalidation, and zombie task cleanup
- Extended `downloadSlice` with `partiallyDownloadedItems: Set<string>` and `removeDownloadedItem(id)` action
- Wired scan fire-and-forget into both `active` AppState branches in `_layout.tsx`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add runDownloadReconciliationScan to fileLifecycleManager.ts** - `3fe4b16` (feat)
2. **Task 2: Add removeDownloadedItem action and partiallyDownloadedItems Set to downloadSlice** - `6213e30` (feat)
3. **Task 3: Wire runDownloadReconciliationScan fire-and-forget into \_layout.tsx AppState handler** - `0cc29f8` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/lib/fileLifecycleManager.ts` - Added `runDownloadReconciliationScan()` export, new imports (downloadService, RNBackgroundDownloader, getDownloadsDirectory)
- `src/stores/slices/downloadSlice.ts` - Added `partiallyDownloadedItems` to state/initial state/initializeDownloads; `removeDownloadedItem` action; `completeDownload` clears partial badge; `resetDownloads` resets partial Set
- `src/app/_layout.tsx` - Import `runDownloadReconciliationScan`; fire-and-forget call in both `active` AppState branches

## Decisions Made

- Used `isDownloadActive` as the single guard covering both active and paused downloads — paused items remain in the `activeDownloads` Map inside DownloadService, so no separate paused check is needed
- Used dynamic inline import (`const { useAppStore } = await import('@/stores/appStore')`) inside the function body to avoid a circular dependency (appStore imports DownloadService)
- Added the scan call to both active branches (early-return branch for playing state, normal branch) to guarantee execution on every foreground resume regardless of playback state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in unrelated files (database.ts mock, coordinator tests, DownloadService, librarySlice test, fileLifecycleManager `lastAccessedAt` type mismatch) — all out of scope per deviation Rule scope boundary. All errors were present before this plan's changes.

## Next Phase Readiness

- `runDownloadReconciliationScan` is ready for consumption; wired and active
- `partiallyDownloadedItems` Set is populated during `initializeDownloads` — available for Phase 7 Plan 02 (download status indicators / partial badge)
- `removeDownloadedItem` action available for any future scan or repair flow

## Self-Check: PASSED

All files exist and all commits verified.

---

_Phase: 07-download-tracking_
_Completed: 2026-02-23_
