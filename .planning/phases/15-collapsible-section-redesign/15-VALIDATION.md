---
phase: 15
slug: collapsible-section-redesign
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **Framework**          | Jest 29.7 + jest-expo + React Native Testing Library 13.3                            |
| **Config file**        | `jest.config.js` (jest-expo preset)                                                  |
| **Quick run command**  | `jest --findRelatedTests src/components/ui/CollapsibleSection.tsx --passWithNoTests` |
| **Full suite command** | `npm test`                                                                           |
| **Estimated runtime**  | ~10 seconds (quick), ~60 seconds (full)                                              |

---

## Sampling Rate

- **After every task commit:** Run `jest --findRelatedTests src/components/ui/CollapsibleSection.tsx --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement                        | Test Type     | Automated Command                                                 | File Exists | Status     |
| -------- | ---- | ---- | ---------------------------------- | ------------- | ----------------------------------------------------------------- | ----------- | ---------- |
| 15-01-01 | 01   | 0    | SECTION-01, SECTION-03             | unit stub     | `jest src/components/ui/__tests__/CollapsibleSection.test.tsx -x` | ❌ W0       | ⬜ pending |
| 15-02-01 | 02   | 1    | SECTION-01, SECTION-03             | unit          | `jest src/components/ui/__tests__/CollapsibleSection.test.tsx -x` | ❌ W0       | ⬜ pending |
| 15-02-02 | 02   | 1    | SECTION-02                         | manual        | N/A                                                               | manual      | ⬜ pending |
| 15-03-01 | 03   | 2    | SECTION-01, SECTION-02, SECTION-03 | unit + manual | `npm test`                                                        | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/components/ui/__tests__/CollapsibleSection.test.tsx` — stubs for SECTION-01 (gradient visible when collapsed), SECTION-03 (no gradient when expanded), always-mounted children (no remount on toggle), short-content guard (no toggle rendered when content ≤ 100px)

_No framework install needed — Jest + RNTL already present._

---

## Manual-Only Verifications

| Behavior                                            | Requirement | Why Manual                                                                                                             | Test Instructions                                                                                                                    |
| --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Height animates on UI thread with no JS-thread jank | SECTION-02  | Reanimated `withTiming` UI-thread behavior cannot be asserted in Jest (Reanimated mocks flatten animations to instant) | Build to simulator; expand/collapse CollapsibleSection — animation should be smooth with no frame drops visible in Xcode frame meter |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
