---
phase: 12
slug: service-decomposition
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                          |
| ---------------------- | ---------------------------------------------- | --------------- | ------- | ------------ |
| **Framework**          | Jest 29.x                                      |
| **Config file**        | `jest.config.js` (project root)                |
| **Quick run command**  | `npm test -- --testPathPattern="(PlayerService | DownloadService | player/ | download/)"` |
| **Full suite command** | `npm test`                                     |
| **Estimated runtime**  | ~30 seconds (quick), ~120 seconds (full)       |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="(PlayerService|DownloadService|player/|download/)"`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + 90% coverage on modified files
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type | Automated Command                                                 | File Exists | Status     |
| -------- | ---- | ---- | ----------- | --------- | ----------------------------------------------------------------- | ----------- | ---------- |
| 12-01-W0 | 01   | 0    | DECOMP-01   | unit      | `npm test -- --testPathPattern="TrackLoadingCollaborator"`        | ❌ W0       | ⬜ pending |
| 12-01-W0 | 01   | 0    | DECOMP-01   | unit      | `npm test -- --testPathPattern="PlaybackControlCollaborator"`     | ❌ W0       | ⬜ pending |
| 12-01-W0 | 01   | 0    | DECOMP-01   | unit      | `npm test -- --testPathPattern="ProgressRestoreCollaborator"`     | ❌ W0       | ⬜ pending |
| 12-01-W0 | 01   | 0    | DECOMP-01   | unit      | `npm test -- --testPathPattern="BackgroundReconnectCollaborator"` | ❌ W0       | ⬜ pending |
| 12-02-W0 | 02   | 0    | DECOMP-02   | unit      | `npm test -- --testPathPattern="DownloadService"`                 | ❌ W0       | ⬜ pending |
| 12-02-W0 | 02   | 0    | DECOMP-02   | unit      | `npm test -- --testPathPattern="DownloadStatusCollaborator"`      | ❌ W0       | ⬜ pending |
| 12-02-W0 | 02   | 0    | DECOMP-02   | unit      | `npm test -- --testPathPattern="DownloadRepairCollaborator"`      | ❌ W0       | ⬜ pending |
| 12-01-01 | 01   | 1    | DECOMP-01   | unit      | `npm test -- --testPathPattern="PlayerService"`                   | ✅          | ⬜ pending |
| 12-01-02 | 01   | 1    | DECOMP-01   | unit      | `npm test -- --testPathPattern="TrackLoadingCollaborator"`        | ❌ W0       | ⬜ pending |
| 12-01-03 | 01   | 1    | DECOMP-01   | unit      | `npm test -- --testPathPattern="PlaybackControlCollaborator"`     | ❌ W0       | ⬜ pending |
| 12-01-04 | 01   | 1    | DECOMP-01   | unit      | `npm test -- --testPathPattern="ProgressRestoreCollaborator"`     | ❌ W0       | ⬜ pending |
| 12-01-05 | 01   | 1    | DECOMP-01   | unit      | `npm test -- --testPathPattern="BackgroundReconnectCollaborator"` | ❌ W0       | ⬜ pending |
| 12-01-06 | 01   | 1    | DECOMP-01   | static    | `npx dpdm --circular src/services/PlayerService.ts`               | N/A         | ⬜ pending |
| 12-02-01 | 02   | 2    | DECOMP-02   | unit      | `npm test -- --testPathPattern="DownloadService"`                 | ❌ W0       | ⬜ pending |
| 12-02-02 | 02   | 2    | DECOMP-02   | unit      | `npm test -- --testPathPattern="DownloadStatusCollaborator"`      | ❌ W0       | ⬜ pending |
| 12-02-03 | 02   | 2    | DECOMP-02   | unit      | `npm test -- --testPathPattern="DownloadRepairCollaborator"`      | ❌ W0       | ⬜ pending |
| 12-02-04 | 02   | 2    | DECOMP-02   | static    | `npx dpdm --circular src/services/DownloadService.ts`             | N/A         | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/services/__tests__/TrackLoadingCollaborator.test.ts` — stubs for DECOMP-01 (track loading in isolation)
- [ ] `src/services/__tests__/PlaybackControlCollaborator.test.ts` — stubs for DECOMP-01 (play/pause/stop in isolation)
- [ ] `src/services/__tests__/ProgressRestoreCollaborator.test.ts` — stubs for DECOMP-01 (session restore in isolation)
- [ ] `src/services/__tests__/BackgroundReconnectCollaborator.test.ts` — stubs for DECOMP-01 (reconnect in isolation)
- [ ] `src/services/__tests__/DownloadService.test.ts` — stubs for DECOMP-02 (facade public interface; no existing test file)
- [ ] `src/services/__tests__/DownloadStatusCollaborator.test.ts` — stubs for DECOMP-02 (status queries in isolation)
- [ ] `src/services/__tests__/DownloadRepairCollaborator.test.ts` — stubs for DECOMP-02 (repair in isolation)
- [ ] `src/services/player/types.ts` — shared interfaces for PlayerService collaborators (created Plan 12-01 Wave 0)
- [ ] `src/services/download/types.ts` — shared interfaces for DownloadService collaborators (created Plan 12-02 Wave 0)

---

## Manual-Only Verifications

| Behavior                                           | Requirement | Why Manual                                       | Test Instructions                                              |
| -------------------------------------------------- | ----------- | ------------------------------------------------ | -------------------------------------------------------------- |
| Background audio continues after app backgrounding | DECOMP-01   | Requires physical device + backgrounding the app | Start playback, background app, verify audio continues for 30s |
| Download continues after app backgrounding         | DECOMP-02   | Requires physical device + backgrounding the app | Start download, background app, verify progress continues      |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
