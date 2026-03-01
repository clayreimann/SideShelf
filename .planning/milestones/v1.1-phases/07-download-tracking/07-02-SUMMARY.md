---
phase: 07-download-tracking
plan: 02
subsystem: ui
tags: [react-native, zustand, downloads, badge, alert]

# Dependency graph
requires:
  - phase: 07-download-tracking
    plan: 01
    provides: partiallyDownloadedItems Set<string> in downloadSlice; isDownloadActive guard
provides:
  - isItemPartiallyDownloaded(itemId) selector in useDownloads hook
  - Amber "Partial" badge on CoverImage when item has some (not all) files on disk
  - Alert action sheet on LibraryItemDetail for partially-downloaded items offering re-download and clear
affects: [ui-download-badges, library-item-display, storage-tab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useCallback with useAppStore.getState() for non-reactive snapshot selectors in useMemo hooks"
    - "Alert.alert action sheet pattern for multi-option destructive actions in React Native"

key-files:
  created: []
  modified:
    - src/stores/appStore.ts
    - src/components/ui/CoverImange.tsx
    - src/components/library/LibraryItemDetail.tsx

key-decisions:
  - "isItemPartiallyDownloaded uses useCallback + useAppStore.getState() (snapshot read) matching the existing isItemDownloaded pattern in useDownloads"
  - "Partial badge is top-left (amber) to avoid overlap with the top-right offline icon"
  - "Partial menu action shown in place of the normal download action when isPartiallyDownloaded && !isDownloading — no separate UI element needed"

patterns-established:
  - "Snapshot selector pattern: useCallback(() => useAppStore.getState().slice.set.has(id), []) for Set membership checks outside reactive subscriptions"

requirements-completed: [DL-01, DL-02]

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 7 Plan 02: Partial Download UI Summary

**Amber "Partial" badge on CoverImage and Alert action sheet on LibraryItemDetail surfacing partiallyDownloadedItems Set via isItemPartiallyDownloaded selector in useDownloads**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-23T20:24:36Z
- **Completed:** 2026-02-23T20:26:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `isItemPartiallyDownloaded(itemId)` selector to `useDownloads` hook in `appStore.ts`
- Added amber "Partial" badge overlay (top-left) to `CoverImage.tsx` for items with some files on disk
- Added partial action sheet to `LibraryItemDetail.tsx` with "Re-download missing files" and "Clear downloaded files" options via `Alert.alert`

## Task Commits

Each task was committed atomically:

1. **Task 1: Expose isItemPartiallyDownloaded selector in useDownloads hook** - `38b2301` (feat)
2. **Task 2: Add partial badge to CoverImage and action sheet to LibraryItemDetail** - `8b65152` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/stores/appStore.ts` - Added `isItemPartiallyDownloaded` useCallback selector and included it in useMemo return and dependency array
- `src/components/ui/CoverImange.tsx` - Destructure `isItemPartiallyDownloaded` from useDownloads; compute `isPartiallyDownloaded`; render amber "Partial" badge when `isPartiallyDownloaded && !isDownloaded`; new StyleSheet entries for badge
- `src/components/library/LibraryItemDetail.tsx` - Destructure `isItemPartiallyDownloaded`; compute `isPartiallyDownloaded`; add `handlePartialDownloadAction` callback with Alert; add "partial" menu action; update menuActions deps

## Decisions Made

- `isItemPartiallyDownloaded` uses `useCallback` with `useAppStore.getState()` (snapshot read) — same pattern as the existing `isItemDownloaded` selector, no reactive subscription needed
- Partial badge placed top-left to avoid overlap with the offline icon at top-right
- Partial menu action replaces the normal download action in the header menu when `isPartiallyDownloaded && !isDownloading` — users see one clear action rather than conflicting options

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in unrelated files (database.ts mock, coordinator tests, DownloadService, fileLifecycleManager `lastAccessedAt`, more/index.tsx route type) — all out of scope per deviation Rule scope boundary. All errors were present before this plan's changes (documented in 07-01-SUMMARY.md).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Partial badge and action sheet are live; they read from `partiallyDownloadedItems` which is populated by the reconciliation scan from Plan 07-01
- Badge disappears reactively after `completeDownload` fires (Plan 07-01 Task 2 wired this — no additional work needed)
- Plan 07-03 (orphan scanner + storage tab) is already complete

## Self-Check: PASSED

All modified files exist and all commits verified.

---

_Phase: 07-download-tracking_
_Completed: 2026-02-23_
