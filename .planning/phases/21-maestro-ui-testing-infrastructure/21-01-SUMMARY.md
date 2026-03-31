---
phase: 21-maestro-ui-testing-infrastructure
plan: "01"
subsystem: testing
tags: [maestro, testID, react-native, accessibility, e2e]

requires: []
provides:
  - testID attributes on login screen inputs (login-server-url-input, login-username-input, login-password-input, login-button)
  - testID attributes on player elements (play-resume-button, player-done-button, seek-slider, speed-control)
  - testID attributes on library elements (download-button, library-search-input)
  - PlayPauseButton accepts optional testID prop passed through to Pressable
  - ProgressBar accepts optional testID prop applied to interactive wrapper View only
affects: [21-02, 21-03, 21-04, maestro-flows]

tech-stack:
  added: []
  patterns:
    - "testID on interactive elements only — not decorative containers or labels"
    - "Optional testID prop pattern: add testID?: string to interface, pass through to the leaf Pressable/View"
    - "ProgressBar testID only applied when interactive=true — non-interactive bars are not targeted by Maestro"

key-files:
  created: []
  modified:
    - src/app/login.tsx
    - src/components/player/PlayPauseButton.tsx
    - src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx
    - src/app/FullScreenPlayer/index.tsx
    - src/components/ui/ProgressBar.tsx
    - src/components/player/PlaybackSpeedControl.tsx
    - src/components/library/LibraryItemDetail.tsx
    - src/components/library/LibraryItemList.tsx

key-decisions:
  - "play-resume-button added to standalone Play TouchableOpacity in ConsolidatedPlayerControls (not-playing branch) — avoids duplicate testIDs when both floating player and detail are on screen"
  - "ProgressBar testID prop only applied to interactive wrapper View (interactive=true gate) — prevents non-interactive progress bars from accidentally receiving the testID"
  - "PlayPauseButton testID passed through to Pressable, not the loading View — loading state renders ActivityIndicator, not a valid tap target for Maestro"

patterns-established:
  - "testID prop threading: add testID?: string to interface + pass to leaf element; callers not passing testID get undefined (no testID attribute in rendered output)"

requirements-completed: [TESTING-01, TESTING-03]

duration: 2min
completed: 2026-03-31
---

# Phase 21 Plan 01: Add testID Attributes to Login Screen, Player, and Library Elements Summary

**testID props added to all 10 Maestro-targeted elements across login screen, full-screen player, and library detail — enabling id:-based targeting in all Phase 21 flows**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T17:56:58Z
- **Completed:** 2026-03-31T17:58:58Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Login screen has 4 testIDs: `login-server-url-input`, `login-username-input`, `login-password-input`, `login-button`
- Player elements have 4 testIDs: `play-resume-button`, `player-done-button`, `seek-slider`, `speed-control`
- Library elements have 2 testIDs: `download-button`, `library-search-input`
- `PlayPauseButton` and `ProgressBar` extended with optional `testID` prop for future callers
- All 925 tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add testID attributes to login screen inputs (TESTING-01)** - `093964d` (feat)
2. **Task 2: Add testID attributes to key interactive elements (TESTING-03)** - `44a3f2f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/app/login.tsx` - Added 4 testID props: login-server-url-input, login-username-input, login-password-input, login-button
- `src/components/player/PlayPauseButton.tsx` - Added optional testID prop to interface; passed to Pressable
- `src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx` - Added testID="play-resume-button" to standalone Play TouchableOpacity
- `src/app/FullScreenPlayer/index.tsx` - Added testID="player-done-button" to chevron-down TouchableOpacity; testID="seek-slider" to ProgressBar call site
- `src/components/ui/ProgressBar.tsx` - Added optional testID prop to ProgressBarProps; applied to interactive wrapper View only
- `src/components/player/PlaybackSpeedControl.tsx` - Added testID="speed-control" to speed badge View inside MenuView
- `src/components/library/LibraryItemDetail.tsx` - Added testID="download-button" to ellipsis MenuView trigger View
- `src/components/library/LibraryItemList.tsx` - Added testID="library-search-input" to search TextInput

## Decisions Made

- `play-resume-button` placed on `ConsolidatedPlayerControls` standalone Play button (not-playing branch) rather than `PlayPauseButton` directly — avoids duplicate testIDs when both floating player and item detail are visible simultaneously (per Research Pitfall 6)
- `ProgressBar` testID only propagates when `interactive=true` — prevents non-interactive read-only progress bars from picking up the testID accidentally

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Worktree was 190 commits behind `milestones/milestone-1.3` at execution start — reset to correct base before making changes. This is a normal parallel agent worktree setup issue, not a code problem.

## Known Stubs

None — all testIDs are wired to actual UI elements that render in the app.

## Next Phase Readiness

- All testIDs from TESTING-01 and TESTING-03 are in place
- Plans 21-02, 21-03, 21-04 (Maestro flows) can now target elements via `id:` selectors
- Existing `testID="floating-player"` and `testID="library-item"` verified untouched (D-04 preserved)

---

_Phase: 21-maestro-ui-testing-infrastructure_
_Completed: 2026-03-31_
