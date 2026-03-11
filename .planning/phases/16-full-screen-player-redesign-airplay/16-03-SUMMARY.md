---
phase: 16-full-screen-player-redesign-airplay
plan: "03"
subsystem: player-ui
tags: [full-screen-player, custom-header, airplay, uimenu, keep-awake, progress-bar]
dependency_graph:
  requires: [16-01, 16-02]
  provides: [custom-header-row, uimenu-settings, chapter-bar-rightlabel, keep-awake-guard]
  affects: [src/app/FullScreenPlayer, src/components/ui/ProgressBar, src/stores/appStore]
tech_stack:
  added: [expo-keep-awake, @react-native-menu/menu, expo-av-route-picker-view (via AirPlayButton)]
  patterns: [guard-component-pattern, useSafeAreaInsets, MenuView-UIMenu, Platform-os-conditional]
key_files:
  created: []
  modified:
    - src/app/FullScreenPlayer/_layout.tsx
    - src/app/FullScreenPlayer/index.tsx
    - src/components/ui/ProgressBar.tsx
    - src/stores/appStore.ts
decisions:
  - "KeepAwakeGuard defined as a top-level function component to hold useKeepAwake hook — avoids conditional hook violation; only rendered when keepScreenAwake && isPlaying"
  - "Spread syntax for Platform.OS !== 'ios' paddingTop on header row avoids style branching elsewhere"
  - "useSettings() hook in appStore.ts extended to expose chapterBarShowRemaining, keepScreenAwake, updateChapterBarShowRemaining, updateKeepScreenAwake — these were in settingsSlice from Plan 01 but not wired to the hook"
  - "rightLabel undefined means ProgressBar uses its default formatTime(duration) — callers pass undefined rather than an explicit fallback"
metrics:
  duration_minutes: 3
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_modified: 4
---

# Phase 16 Plan 03: Custom Header Row + UIMenu + ProgressBar rightLabel Summary

Custom header row with drag pill (iOS), chevron dismiss, AirPlayButton, and UIMenu gear button fully replacing native navigation chrome in FullScreenPlayer; ProgressBar gains generic rightLabel override prop for chapter time remaining display.

## What Was Built

### \_layout.tsx

- `headerShown: false` removes native navigation chrome
- Removed `headerStyle`, `headerTintColor`, `headerTitleStyle`, `headerShadowVisible` (moot when header hidden)
- Screen now owns its own safe area insets via `useSafeAreaInsets`

### ProgressBar.tsx

- Added `rightLabel?: string` prop to `ProgressBarProps` interface
- Right-side time label now renders `rightLabel` when provided, falling back to `formatTime(duration)` when undefined
- Zero changes to existing callers — fully backwards compatible

### appStore.ts (useSettings hook)

- Exposed `chapterBarShowRemaining`, `keepScreenAwake`, `updateChapterBarShowRemaining`, `updateKeepScreenAwake` — added in settingsSlice (Plan 01) but not yet surfaced in the hook

### FullScreenPlayer/index.tsx

- **Removed:** `Stack.Screen` Done button block; `Stack` import from expo-router
- **Added:** `KeepAwakeGuard` function component (guard pattern) — rendered only when `keepScreenAwake && isPlaying`
- **Added:** Drag pill (iOS only) — `alignItems: 'center'`, `paddingTop: insets.top + 4`, pill View `width: 36, height: 4`
- **Added:** Custom header row — chevron dismiss (`Ionicons chevron-down`), spacer, `AirPlayButton`, `MenuView` gear button
- **UIMenu structure:** Progress Format section (3 items with checkmarks), Chapter Bar Time section (2 items), Keep Screen Awake toggle
- **handleMenuAction:** `useCallback` dispatching to `updateProgressFormat` / `updateChapterBarShowRemaining` / `updateKeepScreenAwake`
- **chapterBarRightLabel:** Computed as `-${formatTime(chapterDuration - chapterPosition)}` when `chapterBarShowRemaining`, else `undefined`; passed to `<ProgressBar rightLabel={chapterBarRightLabel} />`
- Chapter toggle link restyled: `fontSize: 12, opacity: 0.5`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] useSettings hook was missing chapterBarShowRemaining and keepScreenAwake**

- **Found during:** Task 2
- **Issue:** `useSettings()` in `appStore.ts` did not expose `chapterBarShowRemaining`, `keepScreenAwake`, `updateChapterBarShowRemaining`, or `updateKeepScreenAwake`, even though these were added to `settingsSlice` in Plan 01. FullScreenPlayer could not destructure these values.
- **Fix:** Added all four to `useSettings()` return value and `useMemo` dependency array in `appStore.ts`.
- **Files modified:** `src/stores/appStore.ts`
- **Commit:** 4593516

## Verification

- `headerShown: false` confirmed in `_layout.tsx`
- `Stack.Screen` count in `index.tsx`: 0
- `MenuView` present in `index.tsx`
- `rightLabel` present in `ProgressBar.tsx`
- TypeScript: 0 errors in modified files (81 pre-existing errors in test mocks — out of scope)
- Test suite: 31/31 suites pass, 790 tests pass, 3 skipped

## Self-Check: PASSED

- FOUND: src/app/FullScreenPlayer/\_layout.tsx
- FOUND: src/app/FullScreenPlayer/index.tsx
- FOUND: src/components/ui/ProgressBar.tsx
- FOUND: src/stores/appStore.ts
- Commit 4593516: feat(16-03): remove nav chrome, add ProgressBar rightLabel, expose settings in useSettings hook
- Commit ac56418: feat(16-03): custom header row with drag pill, AirPlay, UIMenu gear in FullScreenPlayer
