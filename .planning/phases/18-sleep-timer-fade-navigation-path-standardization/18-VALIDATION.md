---
phase: 18
slug: sleep-timer-fade-navigation-path-standardization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                           |
| ---------------------- | ------------------------------- |
| **Framework**          | Jest 29.7 + jest-expo preset    |
| **Config file**        | `jest.config.js` (project root) |
| **Quick run command**  | `npm test -- --passWithNoTests` |
| **Full suite command** | `npm test`                      |
| **Estimated runtime**  | ~30 seconds                     |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement   | Test Type   | Automated Command                                         | File Exists | Status     |
| -------- | ---- | ---- | ------------- | ----------- | --------------------------------------------------------- | ----------- | ---------- |
| 18-01-W0 | 01   | 0    | SLEEP-01      | unit        | `jest --testPathPattern="PlayerBackgroundServiceFade" -x` | ❌ W0       | ⬜ pending |
| 18-01-01 | 01   | 1    | SLEEP-01      | unit        | `jest --testPathPattern="PlayerBackgroundServiceFade" -x` | ❌ W0       | ⬜ pending |
| 18-01-02 | 01   | 1    | SLEEP-01      | unit        | `jest --testPathPattern="PlayerBackgroundServiceFade" -x` | ❌ W0       | ⬜ pending |
| 18-02-W0 | 02   | 0    | NAVIGATION-03 | unit        | `jest --testPathPattern="deepLink" -x`                    | ❌ W0       | ⬜ pending |
| 18-02-01 | 02   | 1    | NAVIGATION-01 | manual-only | N/A                                                       | N/A         | ⬜ pending |
| 18-02-02 | 02   | 1    | NAVIGATION-02 | manual-only | N/A                                                       | N/A         | ⬜ pending |
| 18-02-03 | 02   | 1    | NAVIGATION-03 | unit        | `jest --testPathPattern="deepLink" -x`                    | ❌ W0       | ⬜ pending |
| 18-03-W0 | 03   | 0    | DEBT-01       | unit        | `jest --testPathPattern="normalizePaths" -x`              | ❌ W0       | ⬜ pending |
| 18-03-01 | 03   | 1    | DEBT-01       | unit        | `jest --testPathPattern="normalizePaths" -x`              | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/services/__tests__/PlayerBackgroundServiceFade.test.ts` — stubs for SLEEP-01 (fade logic, cancel restore, chapter timer)
- [ ] `src/services/__tests__/deepLinkHandler.test.ts` — stubs for NAVIGATION-03 (URL parsing, auth guard, tab routing)
- [ ] `src/db/helpers/__tests__/normalizePaths.test.ts` — stubs for DEBT-01 (migration SQL outcomes on dirty rows)

---

## Manual-Only Verifications

| Behavior                                                        | Requirement         | Why Manual                                                                              | Test Instructions                                                                                                            |
| --------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| More tab series list tap opens series detail within More stack  | NAVIGATION-01       | Navigation routing requires a running app; Expo Router stack behavior not unit-testable | Open app → More tab → Series → tap any series → confirm detail screen opens with back button returning to More/Series list   |
| More tab authors list tap opens author detail within More stack | NAVIGATION-02       | Navigation routing requires a running app                                               | Open app → More tab → Authors → tap any author → confirm detail screen opens with back button returning to More/Authors list |
| `sideshelf://` deep link opens app and navigates correctly      | NAVIGATION-03 (E2E) | Requires native build with updated scheme + real device/sim                             | Build app → run `xcrun simctl openurl booted sideshelf://library` → confirm library tab opens                                |
| Sleep fade: audio fades over final 30s                          | SLEEP-01 (E2E)      | TrackPlayer volume is hardware-level, not mockable                                      | Set sleep timer to 35s → after ~5s confirm volume fades → timer fires at 0s → confirm volume restored to pre-fade level      |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
