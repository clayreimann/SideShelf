---
phase: 19-performance-quick-wins-orphan-reassociation
plan: "04"
subsystem: storage-ui
tags: [orphan-repair, storage-screen, db-repair, ux]
dependency_graph:
  requires: [19-00]
  provides: [DEBT-02]
  affects: [src/app/(tabs)/more/storage.tsx]
tech_stack:
  added: []
  patterns: [drizzle-orm join query, useCallback with stable module-scope deps]
key_files:
  created: []
  modified:
    - src/app/(tabs)/more/storage.tsx
decisions:
  - "markAudioFileAsDownloaded called with storage location defaulting to 'caches' — matches the download path location for cached orphan files"
  - "Extension-based isAudio detection used (vs DB lookup first) to determine which helper to call before looking up the file ID"
  - "Empty useCallback deps array is correct: db, eq, and, mediaMetadata, audioFiles, libraryFiles are all module-scope imports; setOrphanFiles is a stable React state setter"
metrics:
  duration: 4 minutes
  completed: "2026-03-18"
  tasks_completed: 1
  files_changed: 1
---

# Phase 19 Plan 04: Orphan File Association UI Summary

One-liner: Added blue link icon to orphan file rows in Storage screen, enabling users to repair missing DB download records by associating the on-disk file back to its library item.

## What Was Built

Modified `src/app/(tabs)/more/storage.tsx` to add an "associate" action alongside the existing delete action on orphan file rows.

### Changes Made

**Type extension:** Added `linkAction?: () => void` to `ActionItem` type.

**New imports:**

- `markAudioFileAsDownloaded`, `markLibraryFileAsDownloaded` from `@/db/helpers/localData`
- `and`, `eq` added to the existing `drizzle-orm` import
- `logger` from `@/lib/logger`

**New callback `associateOrphanFile`:**

1. Looks up item title via `mediaMetadata.libraryItemId` query
2. Determines file type by extension (audio vs library file)
3. Queries for the DB file ID — audio files via `audioFiles` joined to `mediaMetadata`; library files directly via `libraryFiles.libraryItemId + filename`
4. If no matching record found, shows "Cannot Repair" alert
5. If found, shows "Repair Download Record" confirmation alert with item title
6. On confirm, calls the appropriate `markAs*Downloaded` helper then removes orphan from list

**Orphan row update:** Added `linkAction: () => void associateOrphanFile(orphan)` to each orphan row mapping.

**renderItem update:** Added blue `link-outline` Ionicons button before the existing red `trash-outline` button in the fallback render path.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` — no errors in storage.tsx (pre-existing errors in test files are unrelated)
- `npm test` — 2 pre-existing failures in AuthProvider and CollapsibleSection; no new failures introduced
- All acceptance criteria met:
  - `associateOrphanFile` callback present
  - `linkAction` type field and usage present
  - "Repair Download Record" alert text present
  - `link-outline` icon present
  - `markAudioFileAsDownloaded` and `markLibraryFileAsDownloaded` imported and used
  - `trashAction` and `deleteOrphanFile` unchanged
  - "Cannot Repair" error case alert present

## Self-Check

**Files exist:**

- `src/app/(tabs)/more/storage.tsx` — FOUND (modified)

**Commits:**

- `6a9e4e9` — storage.tsx changes included in chore(19-00) pre-staged commit

## Self-Check: PASSED
