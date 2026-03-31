---
phase: 16
slug: full-screen-player-redesign-airplay
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| **Framework**          | Jest 29.7 + jest-expo 54                                                       |
| **Config file**        | `jest.config.js`                                                               |
| **Quick run command**  | `jest --findRelatedTests src/stores/slices/settingsSlice.ts --passWithNoTests` |
| **Full suite command** | `npm test`                                                                     |
| **Estimated runtime**  | ~30 seconds                                                                    |

---

## Sampling Rate

- **After every task commit:** Run `jest --findRelatedTests <changed-file> --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan   | Wave | Requirement                     | Test Type | Automated Command                                                                          | File Exists        | Status     |
| -------- | ------ | ---- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------ | ------------------ | ---------- |
| 16-W0-01 | Wave 0 | 0    | PLAYER-03                       | unit      | `jest --findRelatedTests src/stores/slices/settingsSlice.ts`                               | ❌ extend existing | ⬜ pending |
| 16-01-xx | 01     | 1    | PLAYER-01, PLAYER-02            | manual    | Visual on device                                                                           | N/A                | ⬜ pending |
| 16-02-xx | 02     | 1    | PLAYER-04, PLAYER-05, PLAYER-06 | manual    | Visual on device (AirPlay non-functional on Simulator)                                     | N/A                | ⬜ pending |
| 16-03-xx | 03     | 2    | PLAYER-03                       | unit      | `jest --findRelatedTests src/stores/slices/settingsSlice.ts`                               | ✅ partial         | ⬜ pending |
| 16-04-xx | 04     | 2    | PERF-11                         | unit/grep | `grep -r "Animated.Value" src/app/FullScreenPlayer/ src/components/player/ChapterList.tsx` | ❌ Wave 0          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/stores/slices/__tests__/settingsSlice.test.ts` — extend with test cases for `chapterBarShowRemaining` and `keepScreenAwake` (initialize, update, revert to default)

_Note: No unit tests for UIMenu interaction — PLAYER-03 verified visually on device due to native rendering dependency. PLAYER-01, PLAYER-02, PLAYER-04, PLAYER-05, PLAYER-06 are device-only (nav chrome, gestures, AirPlay hardware)._

---

## Manual-Only Verifications

| Behavior                                                 | Requirement | Why Manual                                                         | Test Instructions                                                                                                                 |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| No nav bar chrome in full screen player                  | PLAYER-01   | UI layout; `headerShown: false` has no automated assertion         | Open app → play item → open full screen player → verify no nav bar chrome                                                         |
| Chevron-down dismisses player                            | PLAYER-02   | Gesture/navigation interaction; router.back() not testable in Jest | Open full screen player → tap chevron → verify player dismisses                                                                   |
| AirPlay button in full screen header                     | PLAYER-04   | AirPlay non-functional on Simulator; device required               | Open full screen player on device → verify AirPlay picker button is visible                                                       |
| AirPlay button in FloatingPlayer                         | PLAYER-05   | Same AirPlay hardware requirement                                  | Play item → verify AirPlay button visible in floating mini player                                                                 |
| AirPlay replaces FullScreenButton; card tap opens player | PLAYER-06   | UI placement + gesture; device verification needed                 | Item details → verify AirPlay on far right, no FullScreenButton; tap card → verify player opens                                   |
| UIMenu opens with 3 sections and correct radio behavior  | PLAYER-03   | Native UIMenu renders outside React tree                           | Open full screen player → tap gear → verify Progress Format, Chapter Bar Time, Keep Screen Awake sections with working checkmarks |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
