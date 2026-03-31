---
phase: 21-maestro-ui-testing-infrastructure
plan: "03"
subsystem: testing
tags: [maestro, ui-testing, regression, yaml, e2e]

# Dependency graph
requires:
  - phase: 21-maestro-ui-testing-infrastructure plan 01
    provides: testID attributes on library-item, play-resume-button, seek-slider, speed-control, player-done-button, floating-player, download-button
  - phase: 21-maestro-ui-testing-infrastructure plan 02
    provides: _login.yaml and _start-playback.yaml reusable subflows
provides:
  - library-navigation.yaml standalone regression flow
  - playback.yaml standalone regression flow
  - download.yaml standalone regression flow
affects: [21-maestro-ui-testing-infrastructure plan 04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone regression flow pattern: each begins with launchApp + runFlow _login.yaml for independent execution"
    - "Seek slider interaction uses swipe not tapOn (PanResponder does not expose tap target)"
    - "Native UIMenu interaction: tap trigger testID to open, then tap menu item by text label"
    - "FloatingPlayer navigation pattern: navigate to Home before tapping floating-player (hides on item detail page)"

key-files:
  created:
    - .maestro/library-navigation.yaml
    - .maestro/playback.yaml
    - .maestro/download.yaml
  modified: []

key-decisions:
  - "download.yaml assertion is lenient (waitForAnimationToEnd only) — native menu timing and download start timing varies; flow succeeding without error is primary verification"
  - "playback.yaml uses swipe direction: RIGHT on seek-slider — PanResponder pitfall documented in Research"
  - "All three flows are independently executable — each includes launchApp and _login.yaml call"

patterns-established:
  - "Regression flow independence: each flow starts with launchApp + _login.yaml so any single flow can run standalone"
  - "Native UIMenu interaction: open via trigger testID tap, then tap text label of desired action"

requirements-completed: [TESTING-04, TESTING-05]

# Metrics
duration: 2min
completed: 2026-03-31
---

# Phase 21 Plan 03: Create Standalone Regression Flows Summary

**Three independently-executable Maestro regression flows covering library navigation, playback (seek/speed), and download (native UIMenu) journeys**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T17:55:59Z
- **Completed:** 2026-03-31T17:57:01Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created `library-navigation.yaml`: standalone flow that logs in, navigates to Library, taps first item, asserts item detail screen via `play-resume-button` testID
- Created `playback.yaml`: standalone flow that starts playback via `_start-playback.yaml` subflow, opens full-screen player, tests seek slider (using `swipe` to handle PanResponder), asserts speed-control, dismisses via `player-done-button`
- Created `download.yaml`: standalone flow that navigates to first library item, triggers download via `download-button` testID + native UIMenu "Download" text tap

## Task Commits

Each task was committed atomically:

1. **Task 1: Create library-navigation.yaml** - `d7821e9` (feat)
2. **Task 2: Create playback.yaml** - `6ad7aed` (feat)
3. **Task 3: Create download.yaml** - `c196a63` (feat)

## Files Created/Modified

- `.maestro/library-navigation.yaml` - Standalone library navigation regression flow
- `.maestro/playback.yaml` - Standalone playback regression flow (seek, speed control, dismiss)
- `.maestro/download.yaml` - Standalone download regression flow (native UIMenu interaction)

## Decisions Made

- `download.yaml` uses a lenient assertion (`waitForAnimationToEnd` only after tapping Download) — native UIMenu timing and download initiation timing varies enough that a strict element assertion would be flaky
- `playback.yaml` navigates to Home before tapping `floating-player` — FloatingPlayer hides itself on the item detail page, same pattern established by `capture-screenshots.yaml`
- `swipe` with `direction: RIGHT` on `seek-slider` per Research Pitfall 3 — PanResponder does not expose a tap target to Maestro's accessibility tree

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all three files created per plan specification.

## Known Stubs

None - these are Maestro YAML flows with no data sources to wire.

## Next Phase Readiness

- All three regression flows ready for execution once Plans 21-01 and 21-02 testIDs and subflows are confirmed in place
- Plan 21-04 can add CI configuration referencing these flow files by path
- Each flow independently runnable: `maestro test .maestro/<flow>.yaml --env MAESTRO_USERNAME=... --env MAESTRO_PASSWORD=... --env MAESTRO_SERVER_URL=...`

---
*Phase: 21-maestro-ui-testing-infrastructure*
*Completed: 2026-03-31*
