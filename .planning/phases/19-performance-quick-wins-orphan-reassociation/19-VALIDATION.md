---
phase: 19
slug: performance-quick-wins-orphan-reassociation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-17
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------- |
| **Framework**          | Jest 29.7.0 + jest-expo                                                            |
| **Config file**        | `jest.config.js`                                                                   |
| **Quick run command**  | `jest --testPathPattern="networkSlice\|ChapterList\|CoverImage" --passWithNoTests` |
| **Full suite command** | `npm test`                                                                         |
| **Estimated runtime**  | ~30 seconds (quick), ~90 seconds (full)                                            |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit && jest --testPathPattern="networkSlice" --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement      | Test Type          | Automated Command                                          | File Exists | Status     |
| -------- | ---- | ---- | ---------------- | ------------------ | ---------------------------------------------------------- | ----------- | ---------- |
| 19-00-01 | 00   | 0    | PERF-01          | install check      | `grep flash-list package.json`                             | N/A         | ⬜ pending |
| 19-00-02 | 00   | 0    | PERF-02          | stub creation      | `jest src/components/player/__tests__/ChapterList.test.ts` | ❌ W0       | ⬜ pending |
| 19-01-01 | 01   | 1    | PERF-01          | manual smoke       | `npx tsc --noEmit`                                         | N/A         | ⬜ pending |
| 19-01-02 | 01   | 1    | PERF-02, PERF-09 | unit               | `jest src/components/player/__tests__/ChapterList.test.ts` | ❌ W0       | ⬜ pending |
| 19-02-01 | 02   | 1    | PERF-08          | unit               | `jest src/components/ui/__tests__/CoverImage.test.tsx`     | ❌ W0       | ⬜ pending |
| 19-02-02 | 02   | 1    | PERF-08          | manual smoke       | `npx tsc --noEmit`                                         | N/A         | ⬜ pending |
| 19-03-01 | 03   | 1    | PERF-04          | TypeScript compile | `npx tsc --noEmit`                                         | N/A         | ⬜ pending |
| 19-03-02 | 03   | 1    | PERF-06          | unit               | `jest src/providers/__tests__/AuthProvider.test.ts`        | ❌ W0       | ⬜ pending |
| 19-03-03 | 03   | 1    | PERF-07          | manual verify      | `npx tsc --noEmit`                                         | N/A         | ⬜ pending |
| 19-03-04 | 03   | 1    | PERF-05          | unit               | `jest src/app/**/__tests__/home.test.ts`                   | ❌ W0       | ⬜ pending |
| 19-03-05 | 03   | 1    | PERF-10          | unit               | `jest src/stores/slices/__tests__/networkSlice.test.ts`    | ✅          | ⬜ pending |
| 19-04-01 | 04   | 1    | DEBT-02          | unit               | `jest src/lib/__tests__/orphanAssociation.test.ts`         | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements (Plan 19-00)

- [ ] Install: `npx expo install @shopify/flash-list react-native-performance` — required before PERF-01 and PERF-05 tasks
- [ ] `src/components/player/__tests__/ChapterList.test.ts` — stubs for PERF-02 (getItemLayout) and PERF-09 (setTimeout cleanup)
- [ ] `src/components/ui/__tests__/CoverImage.test.tsx` — stubs for PERF-08 (expo-image usage, dim overlay logic)
- [ ] `src/providers/__tests__/AuthProvider.test.ts` — stubs for PERF-06 (concurrent auth reads)
- [ ] `src/lib/__tests__/orphanAssociation.test.ts` — stubs for DEBT-02 (associate action, DB repair, list update)
- [ ] `src/app/(tabs)/home/__tests__/home.test.ts` — stubs for PERF-05 (TTI mark fires)

_Note: `src/stores/slices/__tests__/networkSlice.test.ts` exists — add one new test case: `resetNetwork() calls the NetInfo unsubscribe function`. This is an addition during plan 03 execution, not a new Wave 0 file._

---

## Manual-Only Verifications

| Behavior                                         | Requirement | Why Manual                                            | Test Instructions                                                                                                              |
| ------------------------------------------------ | ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| FlashList grid/list layout renders without gaps  | PERF-01     | No RN component test infrastructure for visual layout | Run on simulator: switch library view mode, verify grid spacing and no item remounting on mode toggle                          |
| Coordinator not initialized at module import     | PERF-07     | Import-time side effects are not easily unit-testable | Add `console.log` in `getCoordinator()` and verify it fires during `initializeApp()`, not at import                            |
| Cover image loads from disk cache on second view | PERF-08     | Disk cache hit requires device filesystem state       | Open library item, background app, reopen — verify image appears instantly without network request (check Flipper network tab) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [ ] Wave 0 plan (19-00) executed successfully
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
