---
phase: 09-navigation-ui-polish
plan: "02"
subsystem: ui
tags: [react-native, animated, skeleton, home-screen, tab-settings, async-storage]

# Dependency graph
requires:
  - phase: 09-navigation-ui-polish
    provides: Research findings confirming Animated API approach for skeleton
provides:
  - Pulsing skeleton shelf component replacing cold-start spinner
  - AsyncStorage helpers for persisting home section count across sessions
  - Home screen skeleton branch with cross-fade transition to real content
  - Drag handle visual affordance on tab reorder rows
affects: [home-screen, tab-bar-settings, cold-start-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Animated.loop + Animated.sequence for pulsing skeleton with useNativeDriver: true"
    - "ContentOpacity Animated.Value starts at 0, fades to 1 over 300ms when data arrives"
    - "Cached section count from AsyncStorage sizes skeleton row count on cold start"

key-files:
  created:
    - src/components/home/SkeletonSection.tsx
  modified:
    - src/lib/appSettings.ts
    - src/app/(tabs)/home/index.tsx
    - src/app/(tabs)/more/tab-bar-settings.tsx

key-decisions:
  - "floatingPlayerPadding is already a style object {paddingBottom: number} — pass it directly as contentContainerStyle, not nested"
  - "sections useMemo defined before useEffect hooks that depend on sections.length to avoid use-before-declaration"
  - "Task 1 files (SkeletonSection.tsx, appSettings.ts) committed in 1da2fd5 via lint-staged stash mechanism"

patterns-established:
  - "Skeleton uses Animated from react-native core (not reanimated) — matches CollapsibleSection.tsx pattern"
  - "COVER_SIZE = 140 matches CoverItem.tsx coverSize constant"

requirements-completed: [UX-01, UX-04]

# Metrics
duration: 4min
completed: 2026-02-28
---

# Phase 9 Plan 02: Cold-Start Skeleton and Tab Drag Handle Summary

**Pulsing skeleton shelves (140x140 cover cards, 800ms opacity loop) replace the ActivityIndicator spinner on cold start, with cached section count and 300ms cross-fade to real content, plus reorder-three drag handle on each reorderable tab row.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-28T01:39:29Z
- **Completed:** 2026-02-28T01:43:38Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `SkeletonSection` component with pulsing Animated.loop (0.3 -> 1 -> 0.3, 800ms per step, useNativeDriver: true) mirroring real shelf layout with header + 4 horizontal card placeholders
- Added `lastHomeSectionCount` key and `getLastHomeSectionCount`/`setLastHomeSectionCount` helpers to `appSettings.ts` for cross-session skeleton sizing
- Replaced `ActivityIndicator` cold-start branch in `home/index.tsx` with `SkeletonSection` array; added `contentOpacity` Animated.Value for 300ms cross-fade when real data arrives
- Added `reorder-three` Ionicons drag handle to each reorderable row in `tab-bar-settings.tsx` (not added to the static "More (always visible)" row)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SkeletonSection component and add appSettings helpers** - `1da2fd5` (feat, included in prior lint-staged run)
2. **Task 2: Wire skeleton into home/index.tsx and add UX-04 drag handle** - `abc370d` (feat)

## Files Created/Modified

- `src/components/home/SkeletonSection.tsx` - Pulsing animated skeleton shelf with section header placeholder and 4 card placeholders (cover + title + subtitle)
- `src/lib/appSettings.ts` - Added `lastHomeSectionCount` SETTINGS_KEY and `getLastHomeSectionCount`/`setLastHomeSectionCount` exported helpers
- `src/app/(tabs)/home/index.tsx` - Replaced ActivityIndicator with SkeletonSection array; added contentOpacity fade-in; reads/writes cached section count
- `src/app/(tabs)/more/tab-bar-settings.tsx` - Added `reorder-three` drag handle icon to `renderTabItem` function

## Decisions Made

- `floatingPlayerPadding` is a style object `{paddingBottom: number}` returned by `useFloatingPlayerPadding()` — used directly as `contentContainerStyle`, not nested inside another object. Plan example had this wrong.
- `sections` useMemo hoisted before the three `useEffect` hooks that depend on `sections.length` to avoid lexical use-before-declaration.
- Task 1 files ended up committed in `1da2fd5` (the 09-01 commit) through lint-staged's stash/restore mechanism. The commit message doesn't reflect Task 1 but the files are correctly committed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed contentContainerStyle type error in skeleton ScrollView**

- **Found during:** Task 2 (Wire skeleton into home/index.tsx)
- **Issue:** Plan specified `contentContainerStyle={{ paddingBottom: floatingPlayerPadding }}` but `floatingPlayerPadding` is already a style object `{paddingBottom: number}`, causing TS2769 type error
- **Fix:** Changed to `contentContainerStyle={floatingPlayerPadding}` — pass the object directly
- **Files modified:** src/app/(tabs)/home/index.tsx
- **Verification:** `npx tsc --noEmit` produces no errors in home/index.tsx
- **Committed in:** abc370d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in plan's example code)
**Impact on plan:** Minor fix, no scope change. TypeScript clean after fix.

## Issues Encountered

- lint-staged stash mechanism caused Task 1 files to be swept into the prior session's commit (`1da2fd5`). The first commit attempt returned exit code 1 due to missing lint-staged backup stash, but the files were already committed. Task 2 committed cleanly with `abc370d`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Skeleton component is ready for reuse in other screens if needed
- `appSettings.ts` helpers are generic enough for other "remember last count" patterns
- Phase 9 Plan 03 can proceed: cover art fix for first-boot after iOS container UUID change

---

_Phase: 09-navigation-ui-polish_
_Completed: 2026-02-28_
