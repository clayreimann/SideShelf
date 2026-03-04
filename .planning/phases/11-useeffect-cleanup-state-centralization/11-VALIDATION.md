---
phase: 11
slug: useeffect-cleanup-state-centralization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                         |
| ---------------------- | --------------------------------------------- | ----------- | ------------ | ----------------------- | ------------------------------- |
| **Framework**          | Jest + React Native Testing Library           |
| **Config file**        | jest.config.js (project root)                 |
| **Quick run command**  | `npm test -- --testPathPattern="settingsSlice | seriesSlice | authorsSlice | libraryItemDetailsSlice | loggerSlice" --passWithNoTests` |
| **Full suite command** | `npm test`                                    |
| **Estimated runtime**  | ~30 seconds (quick), ~120 seconds (full)      |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="settingsSlice|seriesSlice|authorsSlice|libraryItemDetailsSlice|loggerSlice" --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (quick run)

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type | Automated Command                                                        | File Exists | Status     |
| -------- | ---- | ---- | ----------- | --------- | ------------------------------------------------------------------------ | ----------- | ---------- |
| 11-01-01 | 01   | 0    | STATE-01    | unit      | `npm test -- --testPathPattern="settingsSlice" -t "viewMode"`            | ❌ W0       | ⬜ pending |
| 11-01-02 | 01   | 0    | STATE-02    | unit      | `npm test -- --testPathPattern="seriesSlice" -t "fetchSeriesProgress"`   | ❌ W0       | ⬜ pending |
| 11-01-03 | 01   | 0    | STATE-03    | unit      | `npm test -- --testPathPattern="authorsSlice" -t "getOrFetchAuthorById"` | ❌ W0       | ⬜ pending |
| 11-01-04 | 01   | 0    | EFFECT-06   | unit      | `npm test -- --testPathPattern="loggerSlice"`                            | ❌ W0       | ⬜ pending |
| 11-02-01 | 02   | 1    | EFFECT-01   | unit      | `npm test -- --testPathPattern="ConsolidatedPlayerControls"`             | ❌ W0       | ⬜ pending |
| 11-02-02 | 02   | 1    | EFFECT-02   | unit      | `npm test -- --testPathPattern="LibraryItemDetail"`                      | ❌ W0       | ⬜ pending |
| 11-02-03 | 02   | 1    | EFFECT-03   | unit      | `npm test -- --testPathPattern="AuthProvider"`                           | ❌ W0       | ⬜ pending |
| 11-02-04 | 02   | 1    | EFFECT-04   | unit      | `npm test -- --testPathPattern="libraryItemDetailsSlice"`                | ❌ W0       | ⬜ pending |
| 11-02-05 | 02   | 1    | EFFECT-05   | manual    | manual review — no useEffect in component                                | manual-only | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/stores/slices/__tests__/settingsSlice.test.ts` — add `viewMode` tests (STATE-01)
- [ ] `src/stores/slices/__tests__/seriesSlice.test.ts` — add `fetchSeriesProgress` tests (STATE-02)
- [ ] `src/stores/slices/__tests__/authorsSlice.test.ts` — add `getOrFetchAuthorById` tests (STATE-03)
- [ ] `src/stores/slices/__tests__/libraryItemDetailsSlice.test.ts` — add authorId/seriesId field tests (EFFECT-04)
- [ ] `src/stores/slices/__tests__/loggerSlice.test.ts` — create new file with availableTags tests (EFFECT-06)
- [ ] `src/db/helpers/__tests__/mediaProgress.test.ts` — add batch query test for `getMediaProgressForItems` (STATE-02 backing helper)

---

## Manual-Only Verifications

| Behavior                                                               | Requirement | Why Manual                                        | Test Instructions                                                                                                    |
| ---------------------------------------------------------------------- | ----------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| MoreScreen renders with APP_VERSION constant, no useEffect for version | EFFECT-05   | Module-scope constant — no state change to assert | Inspect MoreScreen.tsx: confirm no `useState`/`useEffect` for version; run app and verify version displays correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
