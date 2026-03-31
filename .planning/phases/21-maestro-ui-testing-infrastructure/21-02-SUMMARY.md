---
phase: 21-maestro-ui-testing-infrastructure
plan: "02"
subsystem: testing
tags: [maestro, yaml, ui-testing, subflows, login, playback]

requires:
  - phase: 21-maestro-ui-testing-infrastructure
    provides: testIDs login-server-url-input, login-username-input, login-password-input, login-button, play-resume-button added in plan 21-01

provides:
  - _login.yaml idempotent login subflow consuming MAESTRO_SERVER_URL/USERNAME/PASSWORD env vars
  - _start-playback.yaml subflow navigating to first library item and starting playback

affects: [21-maestro-ui-testing-infrastructure]

tech-stack:
  added: []
  patterns:
    - "Underscore-prefixed subflows in .maestro/ for reusable flow composition"
    - "Idempotent login via notVisible: Library conditional guard"
    - "Double-tap Library tab to reset deep nav stack before item selection"

key-files:
  created:
    - .maestro/_login.yaml
    - .maestro/_start-playback.yaml
  modified: []

key-decisions:
  - "tap username field after server URL entry to trigger onBlur/ping before submitting login"
  - "play-resume-button tapped optional:true, followed by Resume text optional:true for prior-state resilience"

patterns-established:
  - "Subflows never contain launchApp — parent standalone flows own app launch"
  - "appId header required in subflows even though they do not launch the app (Maestro Pitfall 1)"

requirements-completed: [TESTING-02, TESTING-04]

duration: 1min
completed: 2026-03-31
---

# Phase 21 Plan 02: Create Reusable Maestro Subflows Summary

**Idempotent `_login.yaml` and `_start-playback.yaml` Maestro subflows using env var credentials and testID selectors from plan 21-01**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-31T17:55:44Z
- **Completed:** 2026-03-31T17:56:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `_login.yaml` with `notVisible: "Library"` conditional guard for idempotency — skips login if already authenticated
- Taps username field after entering server URL to trigger `onBlur`/ping before submitting (handles async ping timing)
- Created `_start-playback.yaml` with double-tap Library reset pattern and optional play/resume buttons for prior-state resilience

## Task Commits

Each task was committed atomically:

1. **Task 1: Create _login.yaml idempotent login subflow** - `c0ca7c9` (feat)
2. **Task 2: Create _start-playback.yaml subflow** - `d7821e9` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `.maestro/_login.yaml` - Idempotent login subflow with env var credentials and notVisible conditional guard
- `.maestro/_start-playback.yaml` - Library navigation + first item playback subflow

## Decisions Made

- Taps `login-username-input` after entering server URL to trigger `onBlur` on the URL field, which fires `tryPing()`. `waitForAnimationToEnd` gives the ping time to resolve before entering credentials — consistent with Research Pitfall 2 in plan context.
- `play-resume-button` tapped with `optional: true`, followed by `text: "Resume"` with `optional: true` — resilient to cases where playback is already in progress.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both reusable subflows are ready for consumption by standalone regression flows (Plan 21-03+)
- Subflows depend on testIDs from Plan 21-01: `login-server-url-input`, `login-username-input`, `login-password-input`, `login-button`, `play-resume-button`, `library-item`
- `capture-screenshots.yaml` is unchanged (verified with `git diff`)

---
*Phase: 21-maestro-ui-testing-infrastructure*
*Completed: 2026-03-31*
