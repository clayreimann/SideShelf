---
phase: 15-collapsible-section-redesign
plan: "02"
subsystem: ui
tags: [react-native-reanimated, expo-linear-gradient, collapsible, animation, ionicons]

requires:
  - phase: 15-01
    provides: failing test scaffold for CollapsibleSection behaviors (SECTION-01, SECTION-02, SECTION-03)

provides:
  - CollapsibleSection rewritten with Reanimated withTiming + peek-fade design
  - expo-linear-gradient installed and wired as gradient overlay
  - Two-phase render pattern for layout measurement before animation
  - Children always mounted — no conditional unmount on toggle
  - Short-content guard: sections ≤100px auto-expand, no gradient, no toggle

affects:
  - 15-03 (DescriptionSection update depends on new CollapsibleSection API)
  - 16 (FullScreenPlayer — Reanimated patterns proven here apply to Phase 16)

tech-stack:
  added:
    - expo-linear-gradient ~15.0.8
  patterns:
    - Two-phase render: plain View pre-layout, Animated.View post-layout
    - React state (isExpanded, isCollapsible) drives conditional render; Reanimated drives animation
    - useSharedValue + useAnimatedStyle + withTiming for height and rotation animation
    - Gradient visibility controlled by React state (not animation opacity) for testability

key-files:
  created: []
  modified:
    - src/components/ui/CollapsibleSection.tsx
    - src/components/ui/__tests__/CollapsibleSection.test.tsx
    - package.json

key-decisions:
  - "Gradient visibility controlled by React state (showGradient) rather than animation opacity — enables queryByTestId assertions in tests to work correctly"
  - "Two-phase render: pre-measurement renders plain View with no height constraint; post-measurement switches to Animated.View — avoids animating before height is known"
  - "headerLayout onLayout guard: only first measurement used (layoutMeasured flag prevents thrashing)"
  - "test assertion adjustment: bare string children in React.Fragment not found by getByText (RNTL requires Text nodes); wrapped test children in RNText"

patterns-established:
  - "Two-phase render pattern for Reanimated height animation: measure first, animate second"
  - "React state + Reanimated split: state owns conditional rendering, Reanimated owns visual animation"

requirements-completed: [SECTION-01, SECTION-02, SECTION-03]

duration: ~25min
completed: 2026-03-09
---

# Phase 15 Plan 02: CollapsibleSection Rewrite Summary

**Reanimated-based CollapsibleSection with 100px peek clip, LinearGradient fade overlay, and always-mounted children — replacing broken RN core Animated implementation**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-09T21:59:00Z
- **Completed:** 2026-03-09T22:24:00Z
- **Tasks:** 1
- **Files modified:** 3 (CollapsibleSection.tsx, test file, package.json)

## Accomplishments

- Installed expo-linear-gradient and wired LinearGradient overlay into collapsed state
- Rewrote CollapsibleSection from scratch using Reanimated withTiming for height + rotation animation
- Implemented two-phase render: pre-layout plain View for natural height measurement, post-layout Animated.View with PEEK_HEIGHT constraint
- Fixed both bugs from old implementation: broken heightInterpolate [0,1]→[0,1] and {isExpanded && children} conditional unmount
- Short-content guard: content ≤100px auto-expands and disables collapsible behavior
- Header-only toggle when title provided; tap-anywhere (Pressable wraps content) when title omitted
- Chevron-forward Ionicons rotates 0°→90° via Reanimated on expand
- All 11 CollapsibleSection tests GREEN; full suite 768 tests passing, 0 regressions

## Task Commits

1. **Task 1: Install expo-linear-gradient and rewrite CollapsibleSection** — `ce5c260` (feat)

## Files Created/Modified

- `src/components/ui/CollapsibleSection.tsx` — Fully rewritten with Reanimated + LinearGradient
- `src/components/ui/__tests__/CollapsibleSection.test.tsx` — Minor adjustment: bare string children wrapped in RNText for getByText compatibility
- `package.json` — Added expo-linear-gradient ~15.0.8 dependency

## Decisions Made

- Gradient visibility driven by React state (`showGradient = layoutMeasured && isCollapsible && !isExpanded`) rather than animation opacity alone — this enables `queryByTestId('collapsible-gradient')` to return null when not visible, matching test expectations
- Two-phase render chosen over single Animated.View from the start — avoids animating to height=0 before measurement, which would collapse content during the initial render
- Test children adjusted from bare string in React.Fragment to RNText wrapper — RNTL's `getByText` only finds text within `<Text>` components, not raw text nodes in Views

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted test children from bare strings to RNText**

- **Found during:** Task 1 (GREEN phase — running tests)
- **Issue:** Tests used `<React.Fragment>{'text string'}</React.Fragment>` as children. RNTL's `getByText` only finds text within `<Text>` React Native components, not raw string nodes. The text appeared in the test renderer tree but `getByText` could not locate it.
- **Fix:** Changed 3 test cases to use `<RNText>text</RNText>` so `getByText` works correctly
- **Files modified:** src/components/ui/**tests**/CollapsibleSection.test.tsx
- **Verification:** All 11 tests GREEN
- **Committed in:** ce5c260 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test assertions, test behavior unchanged)
**Impact on plan:** Minimal — test intent preserved, only the child wrapper type changed for RNTL compatibility.

## Issues Encountered

- `npx expo install` failed (npm misinterprets as script). Used `./node_modules/.bin/expo install expo-linear-gradient` directly.

## Next Phase Readiness

- CollapsibleSection API complete — `title` is optional, `icon` prop removed
- DescriptionSection currently passes `title={translate("libraryItem.description")} defaultExpanded={true}` — Plan 03 will update it to remove the title prop and use the tap-anywhere model
- Reanimated withTiming pattern proven in this component — ready to apply in FullScreenPlayer (Phase 16)

---

_Phase: 15-collapsible-section-redesign_
_Completed: 2026-03-09_
