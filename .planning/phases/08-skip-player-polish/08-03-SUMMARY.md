---
phase: 08-skip-player-polish
plan: "03"
subsystem: ui
tags: [react-native, player, skip-button, ios, uat, device-verification]

# Dependency graph
requires:
  - phase: 08-skip-player-polish
    provides: Plan 01 — useSettings() interval persistence; Plan 02 — SEEK_COMPLETE lock screen sync
provides:
  - SKIP-01 verified on device: short tap skips without opening the interval menu
  - SKIP-02 verified on device: lock screen elapsed time updates after same-chapter skip
  - PLR-01/PLR-02 verified on device: intervals persist across app restart
  - SkipButton gesture architecture hardened: Pressable outside MenuView, programmatic show() via ref
  - Cover art partial fix: PlayerService guards imageUrl to remote URLs only (local paths may be stale)
affects: [09-tab-navigation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SkipButton: Pressable wraps MenuView with onLongPress calling MenuComponentRef.show() — UIContextMenuInteraction no longer blocks inner tap recognition"
    - "suppressNextPress ref prevents onPress firing on the release of a long press"
    - "PlayerService: imageUrl used only for remote podcast URLs; getCoverUri() always used for local audiobook art to handle iOS container UUID changes"

key-files:
  created: []
  modified:
    - src/components/player/SkipButton.tsx
    - src/services/PlayerService.ts

key-decisions:
  - "SkipButton architecture changed from shouldOpenOnLongPress to Pressable-outside-MenuView with programmatic show() — shouldOpenOnLongPress alone was insufficient on iOS 18 to prevent UIContextMenuInteraction from swallowing short taps"
  - "suppressNextPress ref on SkipButton prevents the onPress handler firing on long-press release — necessary because Pressable fires both onLongPress and onPress when held"
  - "Long-press interval selection changed to one-time apply (does not persist) — user intent in Settings should set the default; long press is a per-skip override"
  - "Cover art fix in PlayerService is partial: local imageUrl paths may be stale after iOS app updates (container UUID changes); getCoverUri() is always current. Full fix deferred to Phase 9"

patterns-established:
  - "SkipButton gesture pattern: Pressable(onPress=skip, onLongPress=ref.show()) wrapping MenuView(ref=MenuComponentRef)"

requirements-completed: [SKIP-01]

# Metrics
duration: device verification session
completed: 2026-02-27
---

# Phase 08 Plan 03: Device Verification & Skip Button Gesture Hardening Summary

**SKIP-01/SKIP-02/PLR-01/PLR-02 verified on device; SkipButton refactored to Pressable-outside-MenuView with programmatic menu open to fix short-tap swallowing on iOS 18**

## Performance

- **Duration:** device verification session
- **Started:** 2026-02-27
- **Completed:** 2026-02-27
- **Tasks:** 2 (Task 1: pre-flight auto + Task 2: human verify checkpoint)
- **Files modified:** 2 (during deviation fix commits)

## Accomplishments

- Device verification confirmed SKIP-02 (lock screen updates after skip) and PLR-01/PLR-02 (intervals persist across restart) work correctly
- SKIP-01 was identified as still reproducing on device — UIContextMenuInteraction was swallowing short taps despite `shouldOpenOnLongPress` being present
- SkipButton refactored: moved Pressable outside MenuView, long press calls `MenuComponentRef.show()` programmatically; short tap now reliably fires without menu appearing
- `suppressNextPress` ref added to prevent `onPress` triggering on long-press release
- Long-press interval selection corrected to one-time apply — Settings is the canonical place to change the default interval; long press now acts as a per-skip override only
- Partial cover art fix applied in PlayerService: `imageUrl` is now only used when it is a remote URL (podcasts); `getCoverUri()` is always used for local audiobook art to avoid stale iOS container paths

## Task Commits

This plan's work was committed atomically alongside the human verification:

1. **Pre-flight: shouldOpenOnLongPress confirmed, tests pass, build succeeded** - no code commit (verification only)
2. **Fix: long-press jump is one-time only — do not persist** - `e4ade48` (fix)
3. **Fix: skip button short-tap and cover art after update** - `00449a8` (fix)

## Files Created/Modified

- `src/components/player/SkipButton.tsx` - Moved Pressable outside MenuView; long press calls `ref.show()` programmatically; `suppressNextPress` ref prevents double-fire on release
- `src/app/FullScreenPlayer/index.tsx` - Long-press menu selection no longer persists the chosen interval (one-time apply)
- `src/services/PlayerService.ts` - `imageUrl` now only used for remote URLs; `getCoverUri()` always used for local art to handle iOS container UUID changes

## Decisions Made

- `shouldOpenOnLongPress` prop on `MenuView` proved insufficient on iOS 18 — UIContextMenuInteraction still intercepted the short-tap gesture before Pressable could handle it. The fix moves Pressable outside MenuView and uses a `MenuComponentRef` to open the menu imperatively on `onLongPress`.
- `suppressNextPress` ref: Pressable fires both `onLongPress` and `onPress` when a press is held long enough. Suppressing `onPress` on the release of a long press ensures no unintended skip fires after selecting an interval.
- Long-press interval selection was changed to one-time apply (not persisted). The original Plan 01 implementation persisted on every long-press, but device verification revealed the intended behavior: Settings controls the default; long press is a contextual override.
- Cover art fix is partial (local path guard in PlayerService). The root cause on first install of a new version is a deeper iOS container UUID change that `getCoverUri()` may not resolve before the player initializes. Full investigation deferred to Phase 9.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SkipButton short-tap still opened menu on iOS 18 despite shouldOpenOnLongPress**

- **Found during:** Task 2 (human device verification)
- **Issue:** `shouldOpenOnLongPress` on `MenuView` did not prevent UIContextMenuInteraction from intercepting the inner Pressable's tap gesture on iOS 18
- **Fix:** Restructured SkipButton: Pressable is now the outer element; MenuView is a child; long press calls `MenuComponentRef.show()` imperatively; `suppressNextPress` ref prevents spurious skip on long-press release
- **Files modified:** `src/components/player/SkipButton.tsx`, `src/app/FullScreenPlayer/index.tsx`
- **Verification:** Verified on device — short tap skips, long press opens menu, no double-fire
- **Committed in:** `e4ade48`, `00449a8`

**2. [Rule 1 - Bug] Cover art missing on first boot after app update**

- **Found during:** Task 2 (human device verification)
- **Issue:** `imageUrl` in player metadata could hold a stale local file path after iOS app updates change the container UUID; the old path no longer resolves
- **Fix:** PlayerService now only uses `imageUrl` when it is a remote URL (podcasts use remote artwork); `getCoverUri()` is always used for local audiobook art
- **Files modified:** `src/services/PlayerService.ts`
- **Verification:** Partial — cover art issue on first install of a new version still present; deferred to Phase 9 for full investigation
- **Committed in:** `00449a8`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs found during device verification)
**Impact on plan:** Both fixes were necessary to satisfy SKIP-01 and address a regression. The cover art fix is partial; full investigation is in Phase 9.

## Issues Encountered

- SKIP-01 reproduced on device despite `shouldOpenOnLongPress` being present in source. Root cause: iOS 18 UIContextMenuInteraction behavior — the `shouldOpenOnLongPress` flag controls whether the context menu fires on long-press, but the interaction still consumed the gesture before the inner Pressable could respond to a short tap. Solution: restructure so Pressable is the outer element and menu is opened programmatically.
- Cover art missing after app update on first boot — root cause is stale local paths in `imageUrl` after iOS container UUID changes. Partial guard applied; full fix requires more investigation (Phase 9).

## Deferred Items

- **Cover art on first install of a new version** — `getCoverUri()` may not resolve correctly before the player fully initializes after an iOS app update changes the container UUID. Added to Phase 9 for investigation.
- **Android artwork bug (#2287)** — `updateMetadataForTrack` may lose artwork on Android lock screen/notification after a seek. Not tested (no Android device available). Remains in the Phase 8 blockers list; does not block phase completion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 8 (Skip Button & Player Polish) is complete — all requirements verified on device
- SKIP-01, SKIP-02, PLR-01, PLR-02 all confirmed working
- Phase 9 (Tab Navigation) can proceed; cover art first-boot issue and Android artwork bug are known deferred items

---

_Phase: 08-skip-player-polish_
_Completed: 2026-02-27_
