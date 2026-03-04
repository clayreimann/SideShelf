---
phase: 13
slug: rn-downloader-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| **Framework**          | Jest 29.7 + jest-expo                                                  |
| **Config file**        | `jest.config.js`                                                       |
| **Quick run command**  | `jest src/services/__tests__/DownloadService.test.ts --watchAll=false` |
| **Full suite command** | `npm test`                                                             |
| **Estimated runtime**  | ~30 seconds (full suite)                                               |

---

## Sampling Rate

- **After every task commit:** Run `jest src/services/__tests__/DownloadService.test.ts --watchAll=false`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type   | Automated Command                                                                         | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ----------- | ----------------------------------------------------------------------------------------- | ----------- | ---------- |
| 13-01-01 | 01   | 1    | DWNLD-01    | manual      | N/A — documentation artifact                                                              | ❌ W0       | ⬜ pending |
| 13-02-01 | 02   | 1    | DWNLD-02    | smoke       | `grep "4.5.3" package.json`                                                               | N/A         | ⬜ pending |
| 13-02-02 | 02   | 1    | DWNLD-03    | unit        | `jest src/services/__tests__/DownloadService.test.ts -t "initialize" --watchAll=false`    | ❌ W0       | ⬜ pending |
| 13-02-03 | 02   | 1    | DWNLD-03    | unit        | `jest src/services/__tests__/DownloadService.test.ts -t "startDownload" --watchAll=false` | ❌ W0       | ⬜ pending |
| 13-02-04 | 02   | 1    | DWNLD-04    | code review | N/A — manual review of plugin independence                                                | N/A         | ⬜ pending |
| 13-02-05 | 02   | 1    | DWNLD-04    | unit        | `jest src/services/__tests__/DownloadService.test.ts -t "done" --watchAll=false`          | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/services/__tests__/DownloadService.test.ts` — stubs covering `initialize()` reconciliation (DWNLD-03), `downloadAudioFile()` / `startDownload()` API call shape (DWNLD-03), and `task.done()` handler (DWNLD-04)
- [ ] Updated mock in `src/__tests__/setup.ts` — rename `checkForExistingDownloads` → `getExistingDownloadTasks` and `download` → `createDownloadTask` to match mainline named-export API

_Existing test infrastructure (jest.config.js, jest-expo preset) covers all phase requirements once Wave 0 stubs exist._

---

## Manual-Only Verifications

| Behavior                                                | Requirement        | Why Manual                                                | Test Instructions                                                                                                           |
| ------------------------------------------------------- | ------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fork diff spike document produced                       | DWNLD-01           | Documentation artifact — no code to assert                | Confirm `docs/investigation/rnbd-fork-diff.md` exists and contains API surface table                                        |
| `withExcludeFromBackup` plugin unchanged post-migration | DWNLD-04           | Native iCloud exclusion behavior cannot be tested in Jest | Code review: confirm `plugins/excludeFromBackup/withExcludeFromBackup.ts` contains zero reference to the downloader package |
| Restart recovery smoke test                             | DWNLD-01, DWNLD-03 | Requires physical or simulated app kill + relaunch        | (1) Start download → (2) Force-kill app → (3) Relaunch → (4) Confirm download is still in-progress or complete, not stuck   |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
