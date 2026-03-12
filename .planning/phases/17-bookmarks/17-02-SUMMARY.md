---
phase: 17-bookmarks
plan: "02"
subsystem: settings
tags: [asyncstorage, zustand, settings, bookmarks]

requires:
  - phase: 17-bookmarks-01
    provides: "bookmark schema + DB helpers that Plan 04 will use alongside this setting"

provides:
  - "getBookmarkTitleMode() / setBookmarkTitleMode() in appSettings.ts"
  - "bookmarkTitleMode: 'auto' | 'prompt' | null in settingsSlice state"
  - "updateBookmarkTitleMode action with optimistic update + revert pattern"
  - "bookmarkTitleMode loaded in parallel in initializeSettings()"

affects:
  - 17-bookmarks-04
  - 17-bookmarks-05

tech-stack:
  added: []
  patterns:
    - "null sentinel for first-time user detection — null means never set; triggers one-time prompt"
    - "optimistic-update + revert pattern for async settings actions"

key-files:
  created: []
  modified:
    - src/lib/appSettings.ts
    - src/stores/slices/settingsSlice.ts
    - src/stores/slices/__tests__/settingsSlice.test.ts

key-decisions:
  - "bookmarkTitleMode uses null sentinel (not 'auto' default) — null distinguishes first-time user (triggers alert) from explicit 'auto' choice"

patterns-established:
  - "New AsyncStorage setting: add key to SETTINGS_KEYS, add typed getter/setter, add to slice state + DEFAULT_SETTINGS + initializeSettings Promise.all + update action"

requirements-completed:
  - BOOKMARK-01

duration: 20min
completed: "2026-03-12"
---

# Phase 17 Plan 02: Settings Data Layer — bookmarkTitleMode Summary

**bookmarkTitleMode AsyncStorage persistence and Zustand slice integration with null-sentinel for first-use detection**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-12T00:36:43Z
- **Completed:** 2026-03-12T00:56:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `bookmarkTitleMode: "@app/bookmarkTitleMode"` key with typed getter/setter to appSettings.ts
- Added `bookmarkTitleMode: 'auto' | 'prompt' | null` to settingsSlice state, actions, DEFAULT_SETTINGS, and parallel initialization
- Implemented `updateBookmarkTitleMode` action with optimistic-update + revert-on-error pattern matching existing actions
- All 55 settingsSlice tests pass; full suite 804/807 passing with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: appSettings.ts — add bookmarkTitleMode persistence** - `0a7b753` (feat)
2. **Task 2: settingsSlice.ts — add bookmarkTitleMode state and action** - `9275718` (feat)

## Files Created/Modified

- `src/lib/appSettings.ts` - Added `bookmarkTitleMode` to SETTINGS_KEYS; added `getBookmarkTitleMode()` returning `'auto' | 'prompt' | null`; added `setBookmarkTitleMode(mode)`
- `src/stores/slices/settingsSlice.ts` - Added `bookmarkTitleMode` to state interface, actions interface, DEFAULT_SETTINGS, initializeSettings Promise.all; implemented `updateBookmarkTitleMode` action
- `src/stores/slices/__tests__/settingsSlice.test.ts` - Added mock for `getBookmarkTitleMode`/`setBookmarkTitleMode`; added default mock return; added `bookmarkTitleMode: null` to initial state assertion

## Decisions Made

- `bookmarkTitleMode` initializes to `null` (not `'auto'`) — `null` is the sentinel that signals "user has never made a choice," which the FullScreenPlayer (Plan 04) checks to trigger the one-time preference alert. Existing `'auto'` value means the user explicitly chose auto-title mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated settingsSlice tests to include new bookmarkTitleMode mock**

- **Found during:** Task 2 (settingsSlice.ts update)
- **Issue:** The `@/lib/appSettings` mock in the test file didn't include `getBookmarkTitleMode` or `setBookmarkTitleMode`, causing the mock module to throw when `initializeSettings` tried to call `getBookmarkTitleMode()`. Additionally, the "Initial State" `toEqual` assertion was missing `bookmarkTitleMode: null`, causing 7 test failures.
- **Fix:** Added `getBookmarkTitleMode: jest.fn()` and `setBookmarkTitleMode: jest.fn()` to the mock; added `getBookmarkTitleMode.mockResolvedValue(null)` and `setBookmarkTitleMode.mockResolvedValue()` in beforeEach; added `bookmarkTitleMode: null` to initial state assertion
- **Files modified:** `src/stores/slices/__tests__/settingsSlice.test.ts`
- **Verification:** All 55 tests pass
- **Committed in:** `9275718` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — test file not updated for new mock)
**Impact on plan:** Auto-fix required for test suite to remain green. No scope creep.

## Issues Encountered

- Git SSH signing via 1Password agent intermittently failed for Task 2 commit. Resolved by using `env SSH_AUTH_SOCK=/Users/clay/.1password/agent.sock git commit` to pass the socket path explicitly. 1Password was running but the env var wasn't inherited by git's subprocess chain.

## Next Phase Readiness

- Plan 03 (BookmarkService) can read `bookmarkTitleMode` from settingsSlice state
- Plan 04 (FullScreenPlayer) can call `updateBookmarkTitleMode` from settingsSlice actions
- Plan 04 (Settings screen) can call `updateBookmarkTitleMode` to expose user preference toggle
- No blockers

---

_Phase: 17-bookmarks_
_Completed: 2026-03-12_
