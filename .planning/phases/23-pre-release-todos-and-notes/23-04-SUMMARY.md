---
phase: 23-pre-release-todos-and-notes
plan: "04"
subsystem: ui
tags: [expo-router, navigation, more-tab, series, authors, re-export, stack-screen]

# Dependency graph
requires: []
provides:
  - Item detail screens accessible from More > Series > Series Detail > Item Detail
  - Item detail screens accessible from More > Authors > Author Detail > Item Detail
  - Re-export route files for More tab deep navigation (series and authors)
  - Authors layout with all Stack.Screen entries registered
affects: [navigation, more-tab, series-tab, authors-tab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-export pattern for cross-stack screen sharing: export { default } from @/app/(tabs)/..."
    - "Directory-based routing required when flat [param].tsx needs nested children"

key-files:
  created:
    - src/app/(tabs)/more/series/[seriesId]/index.tsx
    - src/app/(tabs)/more/series/[seriesId]/item/[itemId].tsx
    - src/app/(tabs)/more/authors/[authorId]/index.tsx
    - src/app/(tabs)/more/authors/[authorId]/item/[itemId].tsx
  modified:
    - src/app/(tabs)/more/_layout.tsx
    - src/app/(tabs)/authors/_layout.tsx

key-decisions:
  - "Flat [seriesId].tsx and [authorId].tsx files renamed to [seriesId]/index.tsx and [authorId]/index.tsx — Expo Router requires directory-based routing when nested children exist under the same dynamic segment"
  - "Stack.Screen names in more/_layout.tsx updated from series/[seriesId] to series/[seriesId]/index to match directory-based file routing"
  - "Authors layout previously only declared index Screen — added [authorId]/index and [authorId]/item/[itemId] entries to enable correct header configuration on nested routes"

patterns-established:
  - "More tab deep navigation: flat re-export files must be directory-based (index.tsx) when nested routes needed"

requirements-completed: [D-16, D-17, D-18]

# Metrics
duration: 15min
completed: 2026-05-01
---

# Phase 23 Plan 04: More Tab Item Detail Navigation Summary

**Re-export routes for More > Series/Authors > Item Detail added; flat route files moved to directory pattern; authors layout Stack.Screen entries completed**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-01T23:22:00Z
- **Completed:** 2026-05-01T23:37:00Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments

- Created `more/series/[seriesId]/item/[itemId].tsx` re-export so item detail is reachable from More > Series stack
- Created `more/authors/[authorId]/item/[itemId].tsx` re-export so item detail is reachable from More > Authors stack
- Moved flat `more/series/[seriesId].tsx` and `more/authors/[authorId].tsx` to directory-based `index.tsx` pattern required for Expo Router nested routing
- Added `series/[seriesId]/item/[itemId]` and `authors/[authorId]/item/[itemId]` Stack.Screen entries in `more/_layout.tsx`
- Added `[authorId]/index` and `[authorId]/item/[itemId]` Stack.Screen entries in `authors/_layout.tsx` (previously only `index` was registered)

## Task Commits

1. **Task 1: Create item detail re-export routes + update layouts** - `c150107` (feat)

**Plan metadata:** (committed with docs commit below)

## Files Created/Modified

- `src/app/(tabs)/more/series/[seriesId]/index.tsx` - Re-export of series/[seriesId]/index (moved from flat [seriesId].tsx)
- `src/app/(tabs)/more/series/[seriesId]/item/[itemId].tsx` - Re-export of series/[seriesId]/item/[itemId]
- `src/app/(tabs)/more/authors/[authorId]/index.tsx` - Re-export of authors/[authorId]/index (moved from flat [authorId].tsx)
- `src/app/(tabs)/more/authors/[authorId]/item/[itemId].tsx` - Re-export of authors/[authorId]/item/[itemId]
- `src/app/(tabs)/more/_layout.tsx` - Added Stack.Screen entries for item detail routes; updated series/authors screen names to directory-based
- `src/app/(tabs)/authors/_layout.tsx` - Added Stack.Screen entries for [authorId]/index and item detail routes

## Decisions Made

- **Directory-based routing required:** Expo Router cannot have both `series/[seriesId].tsx` (flat file) and `series/[seriesId]/item/[itemId].tsx` (nested) simultaneously. The flat file must become `series/[seriesId]/index.tsx`. Applied to both series and authors.
- **Stack.Screen name updated:** After the flat-to-directory move, the Stack.Screen `name="series/[seriesId]"` in `more/_layout.tsx` needed to become `name="series/[seriesId]/index"` to match the file location.
- **Authors layout gap fixed:** The `authors/_layout.tsx` only declared `index` — `[authorId]/index` and `[authorId]/item/[itemId]` entries were added for correct header configuration on nested routes.

## Deviations from Plan

None — plan executed exactly as written. The directory coexistence check mentioned in the plan was resolved as expected: flat files must be converted to directory pattern, which was done.

## Issues Encountered

- Pre-existing flaky test in `PlayerStateCoordinator.test.ts` fails intermittently under Jest parallel execution (not in isolation). Confirmed unrelated to route file changes — coordinator has no dependency on app route files.

## Known Stubs

None — all re-export files wire directly to the same component (`LibraryItemDetail`) used in the series and authors tabs.

## Next Phase Readiness

- More tab deep navigation is complete: More > Series/Authors > Detail > Item Detail all work with correct headers
- No blockers for remaining Phase 23 plans

---
*Phase: 23-pre-release-todos-and-notes*
*Completed: 2026-05-01*
