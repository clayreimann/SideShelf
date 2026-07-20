---
created: 2026-07-20T00:00:00.000Z
title: Audit and enable SQLite foreign-key enforcement
area: database
files:
  - src/db/client.ts
  - src/db/schema/
  - src/db/migrations/
  - src/__tests__/utils/testDb.ts
  - src/db/helpers/wipeUserData.ts
---

## Problem

The Drizzle schema declares foreign keys and `ON DELETE CASCADE` behavior, but the main Expo SQLite connection and the in-memory test connection do not consistently enable `PRAGMA foreign_keys`. Cascades such as `local_progress_snapshots.session_id -> local_listening_sessions.id` are therefore inert in configurations where SQLite keeps its default enforcement setting. Enabling enforcement without first auditing existing databases could expose accumulated orphan rows or make an otherwise valid migration fail partway through app startup.

## Constraint inventory

Audit the generated migrations against every relationship declared in `src/db/schema/`, including:

- library hierarchy: `library_items.library_id`, `media_metadata.library_item_id`, and `library_files.library_item_id`;
- media children: `audio_files.media_id` and `chapters.media_id`;
- media joins: both foreign-key columns in `media_authors`, `media_genres`, `media_series`, `media_tags`, and `media_narrators`;
- server-owned user data: `bookmarks.user_id` and `media_progress.user_id`;
- local cache/download state: `local_cover_cache.media_id`, `local_audio_file_downloads.audio_file_id`, and `local_library_file_downloads.library_file_id`;
- listening state: `local_listening_sessions.user_id` and `local_listening_sessions.media_id`;
- progress delivery: `progress_sync_outbox.session_id` and `progress_sync_outbox.user_id`;
- recovery snapshots: `local_progress_snapshots.session_id`, whose declared `ON DELETE CASCADE` is currently inert when foreign-key enforcement is disabled.

Confirm that the inventory matches `PRAGMA foreign_key_list(<table>)` for a freshly migrated database. Record intentional relationships that remain unconstrained, such as `local_listening_sessions.library_item_id`, rather than silently adding constraints during the audit.

## Required work

1. Add a preflight audit that runs `PRAGMA foreign_key_check` on an existing production database before enforcement is enabled. Capture table, rowid, parent table, and constraint index in redacted diagnostics so violations can be explained.
2. Define and test an explicit repair policy for every possible orphan class. Prefer reconstructing valid parents when authoritative local data exists; otherwise delete child rows in dependency order. Do not use blanket deletion or rely on newly enabled cascades to repair already-invalid rows.
3. Apply repairs in a journaled migration before the connection begins enforcing foreign keys. Account for SQLite migration ordering: `PRAGMA foreign_keys` cannot be toggled effectively from inside an active transaction, and schema/data migrations must finish without violating the newly enforced graph.
4. Enable `PRAGMA foreign_keys = ON` for every production connection at connection initialization, then verify `PRAGMA foreign_keys` returns `1` before repositories/services use the database.
5. Enable the same pragma in `TestDatabase` so helper and migration tests exercise production-equivalent constraints. Keep targeted pre-enforcement migration fixtures able to opt out explicitly when they need to construct legacy invalid state.
6. Revisit explicit cleanup order in `wipeUserData()` after enforcement is proven. Keeping defensive child-first deletion is acceptable, but tests must prove both explicit cleanup and the declared cascades, including session deletion removing `progress_sync_outbox` and `local_progress_snapshots`.

## Verification

- A freshly migrated production-shaped database reports foreign keys enabled and `PRAGMA foreign_key_check` returns no rows.
- A fixture for each orphan class is either repaired deterministically or blocks rollout with an actionable diagnostic; no violation is silently ignored.
- Production and `TestDatabase` connections have parity for `PRAGMA foreign_keys`, migration order, and cascade behavior.
- Deleting representative parents exercises every declared cascade, with an explicit assertion for `local_progress_snapshots.session_id`.
- Existing databases upgrade without data loss outside the documented repair policy, and rollback/retry of an interrupted repair remains safe.

Do not enable the pragma as part of the stale-token progress synchronization work; this is a separately reviewed database rollout.
