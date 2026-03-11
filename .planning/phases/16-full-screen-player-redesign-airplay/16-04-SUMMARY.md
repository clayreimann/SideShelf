---
phase: 16-full-screen-player-redesign-airplay
plan: "04"
subsystem: ui
tags: [reanimated, animation, player, chapter-list, ui-thread, performance]

# Dependency graph
requires:
  - phase: 16-03
    provides: FullScreenPlayer with custom header, AirPlay, UIMenu, ProgressBar rightLabel, KeepAwakeGuard
provides:
  - Chapter panel animation runs on UI thread via Reanimated useSharedValue + withTiming
  - ChapterList interface updated to accept animatedStyle prop (AnimatedStyle<ViewStyle>)
  - No Animated.Value or useNativeDriver: false in FullScreenPlayer or ChapterList
affects:
  - Phase 17 (any future FullScreenPlayer changes)
  - Any component that imports or wraps ChapterList

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reanimated useSharedValue + withTiming for layout animations (width/height/opacity/transform) on UI thread"
    - "useAnimatedStyle worklet returning ViewStyle properties for Animated.View from react-native-reanimated"
    - "AnimatedStyle<ViewStyle> prop type instead of ReturnType<typeof useAnimatedStyle> for cross-component animated style passing"
    - "Computed dimension constants moved before early-return guard to satisfy unconditional hook rules"

key-files:
  created: []
  modified:
    - src/components/player/ChapterList.tsx
    - src/app/FullScreenPlayer/index.tsx

key-decisions:
  - "animatedStyle prop typed as AnimatedStyle<ViewStyle> (imported from react-native-reanimated) instead of ReturnType<typeof useAnimatedStyle> — avoids DefaultStyle union mismatch with Animated.View style prop"
  - "chapterPanelStyle includes marginBottom: 16 and overflow: 'hidden' directly in useAnimatedStyle — avoids array style merging type errors with Reanimated's Animated.View"
  - "fullCoverSize, minimizedCoverSize, containerHeight moved before early return guard to satisfy unconditional hook call rules"

patterns-established:
  - "Cross-component animated style passing: use AnimatedStyle<ViewStyle> prop type, not ReturnType<typeof useAnimatedStyle>"
  - "Static style properties (marginBottom, overflow, borderRadius) that must animate: include inside useAnimatedStyle worklet rather than merging with array style"

requirements-completed:
  - PERF-11

# Metrics
duration: 6min
completed: 2026-03-11
---

# Phase 16 Plan 04: Chapter Panel Reanimated Migration Summary

**Chapter panel and cover animations moved from JS-thread Animated.parallel (useNativeDriver: false) to Reanimated useSharedValue + withTiming running entirely on the UI thread**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-11T14:23:49Z
- **Completed:** 2026-03-11T14:29:49Z
- **Tasks:** 2 of 3 (Task 3 is human-verify checkpoint — pending device verification)
- **Files modified:** 2

## Accomplishments

- ChapterList interface migrated: removed `chapterListAnim: Animated.Value` and `containerHeight: number`; added `animatedStyle: AnimatedStyle<ViewStyle>`
- All three interpolation constants (chapterListOpacity, chapterListTranslateY, chapterListHeight) removed; Animated.View from react-native-reanimated uses passed style directly
- FullScreenPlayer chapter panel animation migrated: `Animated.parallel` useEffect replaced by `withTiming` calls in `toggleChapterList`; two shared values (`coverSizeSV`, `chapterPanelSV`) drive UI-thread animations
- Cover `Animated.View` updated to use `coverAnimStyle` from `useAnimatedStyle` (no more `interpolate()` calls)
- Zero `Animated.Value` or `useNativeDriver` references in either file — verified by grep
- 790 tests pass, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate ChapterList interface from Animated.Value to animatedStyle** - `2c4ab24` (feat)
2. **Task 2: Migrate FullScreenPlayer chapter panel animation to Reanimated** - `eb77dde` (feat)
3. **Task 3: Visual verification on device** - pending checkpoint (human-verify)

## Files Created/Modified

- `src/components/player/ChapterList.tsx` — Updated interface: removed Animated.Value props, added animatedStyle: AnimatedStyle<ViewStyle>; Animated.View from reanimated uses passed style
- `src/app/FullScreenPlayer/index.tsx` — Replaced Animated.parallel/useNativeDriver: false with useSharedValue + withTiming; added coverAnimStyle + chapterPanelStyle; cover and chapter panel animate on UI thread

## Decisions Made

- `animatedStyle` prop typed as `AnimatedStyle<ViewStyle>` rather than `ReturnType<typeof useAnimatedStyle>` — the latter resolves to `DefaultStyle` (a wide union including TextStyle) which doesn't match Reanimated's `Animated.View` style prop type. `AnimatedStyle<ViewStyle>` is precise and passes TypeScript without casts.
- Static layout properties (`marginBottom: 16`, `overflow: 'hidden'`) included inside `chapterPanelStyle`'s `useAnimatedStyle` worklet rather than array-merged at the call site — array merging `[animatedStyle, { marginBottom: 16 }]` triggers type errors with Reanimated's strict style prop union.
- `fullCoverSize`, `minimizedCoverSize`, `containerHeight` moved above the `if (!currentTrack) return null` guard — `useAnimatedStyle` hooks must be called unconditionally per React rules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AnimatedStyle<ViewStyle> prop type instead of ReturnType<typeof useAnimatedStyle>**

- **Found during:** Task 1 (ChapterList interface update)
- **Issue:** `ReturnType<typeof useAnimatedStyle>` resolves to `DefaultStyle` (includes TextStyle union) which is not assignable to Reanimated's `Animated.View` style prop type `StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>`
- **Fix:** Import `AnimatedStyle` from `react-native-reanimated` and type prop as `AnimatedStyle<ViewStyle>`
- **Files modified:** `src/components/player/ChapterList.tsx`
- **Verification:** `npx tsc --noEmit` returns no errors for ChapterList.tsx
- **Committed in:** 2c4ab24 (Task 1 commit)

**2. [Rule 1 - Bug] Static styles included in useAnimatedStyle worklet instead of array merge**

- **Found during:** Task 1 (ChapterList Animated.View update)
- **Issue:** `style={[animatedStyle, { marginBottom: 16, overflow: 'hidden' as const }]}` triggers TS2322 type mismatch — plan snippet showed array merging but Reanimated's style union doesn't accept it cleanly
- **Fix:** Move `marginBottom` and `overflow` into `chapterPanelStyle`'s `useAnimatedStyle` worklet in index.tsx; ChapterList uses `style={animatedStyle}` directly
- **Files modified:** `src/components/player/ChapterList.tsx`, `src/app/FullScreenPlayer/index.tsx`
- **Verification:** TypeScript compiles clean; grep confirms no Animated.Value or useNativeDriver references
- **Committed in:** 2c4ab24, eb77dde (Task 1 and 2 commits)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — TypeScript type precision adjustments)
**Impact on plan:** Both fixes improve type safety over the plan's suggested code. Behavior is identical. No scope creep.

## Issues Encountered

None beyond the TypeScript type precision fixes documented above.

## Next Phase Readiness

- Task 3 (human-verify checkpoint) still pending — device verification of full Phase 16 feature set required
- Once approved: Phase 16 is complete; Phase 17 (bookmark/library features) can begin
- No blockers for next phase startup

---

_Phase: 16-full-screen-player-redesign-airplay_
_Completed: 2026-03-11_
