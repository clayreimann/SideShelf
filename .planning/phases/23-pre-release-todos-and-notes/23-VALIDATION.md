---
phase: 23
slug: pre-release-todos-and-notes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                    |
| ---------------------- | -------------------------------------------------------- |
| **Framework**          | jest 29.x (jest-expo preset)                             |
| **Config file**        | `jest.config.js`                                         |
| **Quick run command**  | `npm test -- --testPathPattern=src/services/coordinator` |
| **Full suite command** | `npm test`                                               |
| **Estimated runtime**  | ~30 seconds (full suite)                                 |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=src/services/coordinator`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement                 | Test Type | Automated Command                               | File Exists | Status     |
| -------- | ---- | ---- | --------------------------- | --------- | ----------------------------------------------- | ----------- | ---------- |
| 23-01-01 | 01   | 1    | Auth flicker                | manual    | `npm test -- --testPathPattern=AuthProvider`    | ✅          | ⬜ pending |
| 23-01-02 | 01   | 1    | Expired token modal         | manual    | `npm test -- --testPathPattern=login`           | ✅          | ⬜ pending |
| 23-02-01 | 02   | 1    | Chapter seek coordinator    | unit      | `npm test -- --testPathPattern=coordinator`     | ✅          | ⬜ pending |
| 23-02-02 | 02   | 1    | skipSmartRewind flag        | unit      | `npm test -- --testPathPattern=PlaybackControl` | ✅          | ⬜ pending |
| 23-03-01 | 03   | 1    | Cold-start position display | manual    | `npm test -- --testPathPattern=playerSlice`     | ✅          | ⬜ pending |
| 23-04-01 | 04   | 1    | PlayPauseButton optimistic  | unit      | `npm test -- --testPathPattern=PlayPauseButton` | ❌ W0       | ⬜ pending |
| 23-05-01 | 05   | 2    | More deep navigation        | manual    | `npm test`                                      | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- Existing infrastructure covers most phase requirements (jest-expo, React Native Testing Library).
- [ ] `src/components/player/__tests__/PlayPauseButton.test.tsx` — unit test stubs for optimistic update behavior (task 23-04-01 is the only gap)

---

## Manual-Only Verifications

| Behavior                                  | Requirement       | Why Manual                                                              | Test Instructions                                                                      |
| ----------------------------------------- | ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Auth splash screen hold until initialized | D-01, D-02        | Requires device/simulator boot; can't automate SplashScreen API in jest | Cold-start app, verify no login flash before tabs appear                               |
| Expired token modal presentation          | D-03 through D-07 | Requires network/token manipulation                                     | Force token expiry, verify formSheet modal, dismissal, headerLeft button               |
| Cold-start chapter highlight              | D-10              | Requires playback state restore cycle on device                         | Open item already in progress, verify correct chapter is highlighted before first play |
| More tab deep navigation                  | D-16 through D-18 | Requires runtime navigation rendering                                   | Navigate More → Series → Item Detail, verify no crash, correct screen                  |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
