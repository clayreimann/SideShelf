---
phase: 18-sleep-timer-fade-navigation-path-standardization
plan: 02
subsystem: ui
tags: [expo-router, navigation, react-native, more-tab, series, authors]

# Dependency graph
requires: []
provides:
  - More-stack series detail route at src/app/(tabs)/more/series/[seriesId].tsx
  - More-stack author detail route at src/app/(tabs)/more/authors/[authorId].tsx
  - More tab series/authors navigation fully self-contained within More stack
affects: [navigation, more-tab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "More-stack wrapper pattern: standalone list screens with /more/{entity}/{id} push paths; detail routes re-export shared screens"

key-files:
  created:
    - src/app/(tabs)/more/series/[seriesId].tsx
    - src/app/(tabs)/more/authors/[authorId].tsx
  modified:
    - src/app/(tabs)/more/_layout.tsx
    - src/app/(tabs)/more/series.tsx
    - src/app/(tabs)/more/authors.tsx

key-decisions:
  - "more/series.tsx and more/authors.tsx are standalone screens not re-exports — intentional duplication so the More stack controls its own navigation paths without coupling to the Series/Authors tab stacks"
  - "Detail route files (more/series/[seriesId].tsx, more/authors/[authorId].tsx) re-export the shared detail screens — code reuse without navigation coupling"

patterns-established:
  - "Tab-scoped navigation: when a shared list screen must navigate within its own tab stack, create a standalone wrapper with absolute paths prefixed by the tab name (/more/series/${id}) rather than shared paths (/series/${id})"

requirements-completed: [NAVIGATION-01, NAVIGATION-02]

# Metrics
duration: 3min
completed: 2026-03-17
---

# Phase 18 Plan 02: More Tab Navigation Self-Containment Summary

**More-scoped series and authors navigation: detail screens now open within More stack via /more/series/${id} and /more/authors/${id} paths instead of escaping to dedicated tab stacks**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-17T20:11:09Z
- **Completed:** 2026-03-17T20:14:12Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `more/series/[seriesId].tsx` and `more/authors/[authorId].tsx` re-export detail routes so shared screens render within the More stack
- Registered both detail routes in `more/_layout.tsx` Stack.Screen entries
- Replaced re-export list screens with standalone wrappers that push to `/more/series/${id}` and `/more/authors/${id}` — eliminating cross-stack navigation escapes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add More-stack detail route files and update layout** - `ac25cdb` (feat)
2. **Task 2: Replace More tab list screens with More-scoped navigation wrappers** - `17930d0` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/app/(tabs)/more/series/[seriesId].tsx` - Re-exports series detail screen for More stack
- `src/app/(tabs)/more/authors/[authorId].tsx` - Re-exports author detail screen for More stack
- `src/app/(tabs)/more/_layout.tsx` - Added Stack.Screen for series/[seriesId] and authors/[authorId]
- `src/app/(tabs)/more/series.tsx` - Standalone More-scoped series list with /more/series/${id} push
- `src/app/(tabs)/more/authors.tsx` - Standalone More-scoped authors list with /more/authors/${id} push

## Decisions Made

- Standalone list wrappers (not re-exports) for `more/series.tsx` and `more/authors.tsx` because the push path is the only difference from the shared screens; this avoids a shared-screen prop for "which stack am I in?" and keeps each tab fully responsible for its own navigation
- Detail route re-exports are appropriate because no navigation override is needed in the detail screen itself — it already uses `useLocalSearchParams` and operates statelessly relative to which stack loaded it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing `PlayerBackgroundServiceFade.test.ts` failures (8 tests) were present before this plan and are unrelated to navigation changes. Logged as out-of-scope; 852 originally passing tests continue to pass.

## Next Phase Readiness

- More tab navigation is self-contained. Series and authors detail navigation stays within the More stack.
- Shared `src/app/(tabs)/series/[seriesId]/index.tsx` and `src/app/(tabs)/authors/[authorId]/index.tsx` are unmodified and continue serving their dedicated tab stacks.

---

_Phase: 18-sleep-timer-fade-navigation-path-standardization_
_Completed: 2026-03-17_
