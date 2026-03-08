---
phase: 10
slug: db-quick-wins
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                          |
| ---------------------- | -------------------------------------------------------------- |
| **Framework**          | Jest 29.7 + jest-expo 54                                       |
| **Config file**        | `package.json` (jest-expo preset)                              |
| **Quick run command**  | `npm test -- --testPathPattern="db/helpers" --passWithNoTests` |
| **Full suite command** | `npm test`                                                     |
| **Estimated runtime**  | ~30 seconds (full suite)                                       |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="db/helpers" --passWithNoTests`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type                              | Automated Command                                                       | File Exists  | Status     |
| -------- | ---- | ---- | ----------- | -------------------------------------- | ----------------------------------------------------------------------- | ------------ | ---------- |
| 10-01-01 | 01   | 1    | DB-01       | manual (pragma in client.ts)           | `npm test -- --testPathPattern="db/client" --passWithNoTests`           | ❌ W0        | ⬜ pending |
| 10-01-02 | 01   | 1    | DB-02       | manual (check generated migration SQL) | N/A — inspect `.sql` file                                               | ✅ generated | ⬜ pending |
| 10-01-03 | 01   | 1    | DB-03       | manual (check generated migration SQL) | N/A — inspect `.sql` file                                               | ✅ generated | ⬜ pending |
| 10-01-04 | 01   | 1    | DB-04       | manual (check generated migration SQL) | N/A — inspect `.sql` file                                               | ✅ generated | ⬜ pending |
| 10-01-05 | 01   | 1    | DB-05       | manual (check generated migration SQL) | N/A — inspect `.sql` file                                               | ✅ generated | ⬜ pending |
| 10-02-01 | 02   | 2    | DB-06       | unit (batch INSERT assertion)          | `npm test -- --testPathPattern="db/helpers/__tests__/libraryItems"`     | ❌ W0        | ⬜ pending |
| 10-02-02 | 02   | 2    | DB-07       | unit (batch INSERT assertion)          | `npm test -- --testPathPattern="db/helpers/__tests__/fullLibraryItems"` | ❌ W0        | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/db/helpers/__tests__/libraryItems.test.ts` — stubs for DB-06 batch upsert assertion
- [ ] `src/db/helpers/__tests__/fullLibraryItems.test.ts` — stubs for DB-07 genres/narrators/tags batch assertion

_Existing infrastructure covers framework, test utilities (`src/__tests__/utils/testDb.ts`), and mocks — no new framework setup needed._

---

## Manual-Only Verifications

| Behavior                                                      | Requirement | Why Manual                                                                                     | Test Instructions                                                                                                                |
| ------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| WAL pragma applied at DB open                                 | DB-01       | Pragma correctness requires real SQLite file on device; unit mocking provides false confidence | After deploying to device/simulator: open app, run a write-heavy operation, check SQLite journal files are `.wal` not `-journal` |
| Index on `library_items.library_id`                           | DB-02       | Migration SQL is the artifact; no runtime assertion needed                                     | Inspect generated `.sql` file for `CREATE INDEX IF NOT EXISTS library_items_library_id_idx`                                      |
| Index on `media_metadata.library_item_id`                     | DB-03       | Same as DB-02                                                                                  | Inspect generated `.sql` file for `media_metadata_library_item_id_idx`                                                           |
| Index on `audio_files.media_id`                               | DB-04       | Same as DB-02                                                                                  | Inspect generated `.sql` file for `audio_files_media_id_idx`                                                                     |
| Composite index on `media_progress(user_id, library_item_id)` | DB-05       | Same as DB-02                                                                                  | Inspect generated `.sql` file for `media_progress_user_library_idx`                                                              |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
