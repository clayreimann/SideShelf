---
phase: 20
slug: tree-shaking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                           |
| ---------------------- | ------------------------------- |
| **Framework**          | Jest (jest-expo preset)         |
| **Config file**        | `jest.config.js` (project root) |
| **Quick run command**  | `npm test -- --passWithNoTests` |
| **Full suite command** | `npm test`                      |
| **Estimated runtime**  | ~60 seconds                     |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + TestFlight UAT checklist completed
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type  | Automated Command              | File Exists      | Status     |
| -------- | ---- | ---- | ----------- | ---------- | ------------------------------ | ---------------- | ---------- |
| 20-01-01 | 01   | 1    | PERF-03     | unit       | `jest --testPathPattern=metro` | ❌ W0 (optional) | ⬜ pending |
| 20-01-02 | 01   | 1    | PERF-03     | manual/e2e | N/A — TestFlight UAT           | N/A              | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no new test files needed before Wave 1.

A unit test for `metro.config.js` env var logic is optional; the primary validation gate is a passing TestFlight build.

_Note: The metro config change is simple (env var check → setTransformOptions). Automated testing of it is low-value given the simplicity; manual TestFlight UAT is the real gate._

---

## Manual-Only Verifications

| Behavior                                                           | Requirement | Why Manual                                                 | Test Instructions                                                  |
| ------------------------------------------------------------------ | ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| App launches without crash after tree shaking enabled              | PERF-03     | TestFlight build required; cannot test in dev              | Install TestFlight build, launch app, confirm no crash on startup  |
| Audio playback works (CollapsibleSection, FullScreenPlayer panels) | PERF-03     | Reanimated worklet behavior only verifiable in prod binary | Play audio, expand/collapse sections, verify all animations render |
| All Reanimated animations work correctly                           | PERF-03     | Worklet initialization may be stripped by tree shaker      | Open FullScreenPlayer, interact with all animated panels           |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
