---
created: 2026-07-20T00:00:00.000Z
title: Make stale-token progress synchronization durable and lossless
phase: 23
area: services
files:
  - src/db/schema/localData.ts
  - src/db/helpers/localListeningSessions.ts
  - src/db/helpers/progressSyncOutbox.ts
  - src/db/migrations/
  - src/services/ProgressService.ts
  - src/services/ProgressSyncWorker.ts
  - src/services/PlayerBackgroundService.ts
  - src/providers/AuthProvider.tsx
  - src/lib/api/endpoints.ts
---

## Problem

The expired-token flow preserves downloaded playback and local identity, but the current progress synchronization model does not guarantee that listening performed while `authStatus === "reauthRequired"` will later reach the server.

Playback progress itself is durable: `ProgressService.updateProgress()` writes the active listening session's position and listening time to SQLite. The synchronization queue, however, is represented by a mutable `local_listening_sessions.is_synced` boolean. Once a session has been marked synced, later local mutations do not consistently mark it unsynced again. A session can therefore follow this sequence:

1. Sync successfully while authenticated, setting `is_synced = true`.
2. Continue playing after terminal token expiry.
3. Persist a newer position locally while server requests are unavailable.
4. End playback before signing in again.
5. Reauthenticate, but never select that session through `getUnsyncedSessions()` because its stale `is_synced = true` value remains.

The current lifecycle change only stops and restarts the periodic timer. Direct synchronization calls can still be reached from playback start, pause, duck, end, stale-session cleanup, and `PlayerBackgroundService`. Those calls can make unauthorized requests during reauthentication and record expected auth unavailability as ordinary synchronization failures. When authentication returns, `ProgressService.initialize()` starts a two-minute timer but does not immediately drain pending work.

The boolean also cannot safely represent progress that changes while an earlier upload is in flight. A successful response for an older snapshot can mark the session synced even if a newer local position was written before the response arrived.

## Decision

Replace `is_synced` as the authoritative queue with a **versioned, coalescing transactional outbox** and move all progress-related server work behind a single auth-aware worker.

The listening-session row remains the local source of truth and the payload source. The outbox stores delivery state, not a JSON copy of every progress tick. There is exactly one outbox row per local listening session. High-frequency updates coalesce by advancing a desired revision rather than appending one record per second.

Delivery is **at least once**. A stable local session UUID is the idempotency key for local-session uploads. Exactly-once behavior is not claimed because the client cannot atomically commit both the remote request and the local acknowledgement.

## Goals

- Never lose a newer local position because an older upload completed later.
- Preserve progress across token expiry, network loss, app termination, and relaunch.
- Make no progress-sync API requests while authentication is unavailable.
- Drain pending work immediately after successful reauthentication.
- Retry transient failures without requiring another playback event.
- Keep one bounded delivery record per session instead of an event per playback tick.
- Centralize authentication, connectivity, retry, and concurrency policy in one worker.
- Preserve existing explicit-logout cleanup and local playback behavior.
- Provide enough persisted diagnostics to explain why a session has not synchronized.

## Non-goals

- Do not build a general-purpose event-sourcing system.
- Do not append every one-second playback update to an unbounded queue.
- Do not change the user-facing expired-session indicator or login-sheet behavior.
- Do not enable starting streaming-only media while reauthentication is required.
- Do not promise exactly-once delivery without corresponding Audiobookshelf server support.
- Do not delete listening-session rows immediately after successful synchronization; existing retention behavior remains separate.
- Do not use this migration to remove the legacy `is_synced` and retry columns. They remain temporarily for compatibility and can be removed after the new path has shipped safely.

## Required invariants

1. A local listening-session mutation and its outbox revision advance commit in the same SQLite transaction.
2. Pending work is derived from `desired_revision > acknowledged_revision`, never from an in-memory flag.
3. A worker acknowledges only the exact revision whose snapshot it uploaded.
4. If local state advances during an upload, the newer revision remains pending after the older request succeeds.
5. Authentication loss stops every progress-sync network path, not only the periodic timer.
6. Expected auth suspension does not increment attempt counts or populate error fields.
7. A transient failure never advances `acknowledged_revision`.
8. A crash after remote acceptance but before local acknowledgement results in a safe retry using the same session identifier.
9. The worker processes only the retained local user associated with the currently authenticated server account.
10. Explicit logout continues deleting user-owned sessions and their outbox rows through foreign-key cascades.

## Data model

Add `progress_sync_outbox` to `src/db/schema/localData.ts`.

| Column                  | Type              | Constraint and meaning                                                                                |
| ----------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `session_id`            | text              | Primary key; foreign key to `local_listening_sessions.id` with `ON DELETE CASCADE`                    |
| `user_id`               | text              | Required; foreign key to `users.id` with `ON DELETE CASCADE`; partitions drains by authenticated user |
| `desired_revision`      | integer           | Required, default `1`; incremented for every outbound-relevant local mutation                         |
| `acknowledged_revision` | integer           | Required, default `0`; highest revision confirmed or deliberately terminally resolved                 |
| `attempt_count`         | integer           | Required, default `0`; consecutive transient failures for the current pending revision                |
| `last_attempt_at`       | integer timestamp | Nullable; most recent actual network attempt                                                          |
| `next_attempt_at`       | integer timestamp | Nullable; earliest retry time after transient failure                                                 |
| `last_success_at`       | integer timestamp | Nullable; most recent successful acknowledgement                                                      |
| `last_error`            | text              | Nullable; most recent transient or classified terminal error                                          |
| `terminal_reason`       | text              | Nullable; stable reason that excludes the row from automatic draining                                 |
| `created_at`            | integer timestamp | Required                                                                                              |
| `updated_at`            | integer timestamp | Required                                                                                              |

Add `progress_sync_outbox_user_retry_idx` on `(user_id, next_attempt_at)`. The user prefix supports account-scoped drains, and the second column supports retry eligibility without maintaining two redundant indexes.

Pending selection joins the outbox to `local_listening_sessions` and filters by:

- matching authenticated `user_id`;
- `terminal_reason IS NULL`;
- `desired_revision > acknowledged_revision`;
- `next_attempt_at IS NULL OR next_attempt_at <= now`.

The outbox has no persisted `in_flight` status or lease. SideShelf has one JavaScript process and one singleton worker, so an in-memory single-flight promise prevents overlapping drains without leaving a stale lease after process death. Pending state remains fully reconstructible from revisions after restart.

## Migration and backfill

Generate the schema DDL through `npm run drizzle:generate` after adding the schema, then add the deterministic `INSERT ... SELECT` backfill to that generated migration. Do not maintain a second handwritten migration for the same schema change.

The migration creates one outbox row for every existing `local_listening_sessions` row:

- Set `desired_revision = 1` for all rows.
- Set `acknowledged_revision = 1` only when all of these are true:
  - `is_synced = true`;
  - `last_sync_time IS NOT NULL`;
  - `updated_at <= last_sync_time`.
- Set `acknowledged_revision = 0` otherwise.

This deliberately resends ambiguous historical rows. Stable session IDs and idempotent server handling make a redundant retry safer than silently dropping listening progress.

The migration must run correctly on databases with active sessions, ended sessions, no sessions, and rows created by every schema version from migration `0008` onward. New non-null schema fields must have defaults in accordance with the repository's SQLite migration rules.

## Database helper boundary

All session and outbox writes remain in `src/db/helpers/`; services must not issue inline Drizzle mutations.

Add transaction-aware helper operations with these responsibilities:

- Start a listening session and create its outbox row atomically.
- Apply one local playback tick—position, listening-time delta, playback rate, and volume—and increment `desired_revision` once in the same transaction.
- End or stale-end a local session and increment `desired_revision` atomically.
- Read the next eligible outbox records and their listening-session snapshots for one user.
- Record a transient failure without changing either revision.
- Acknowledge a captured revision without copying `desired_revision` into `acknowledged_revision`.
- Terminally resolve a captured revision with an explicit reason.

The acknowledgement helper receives both `sessionId` and `sentRevision`. It advances `acknowledged_revision` to `sentRevision` only when that value is greater than the current acknowledgement. It never reads the current desired revision and substitutes it for the revision that was actually sent.

Server-originated reconciliation must use a separate helper path that updates local resume data without advancing the outbound desired revision. Avoid a boolean parameter such as `markDirty`; use distinct, intention-revealing helper names for local playback mutations and server reconciliation.

`resetSessionListeningTime()` and server-session-ID bookkeeping are acknowledgement-side changes and must not enqueue another outbound revision.

The hot path must not perform separate transactions for listening time, position, and outbox state. Replace the current split updates with one helper transaction so each one-second playback tick performs one session update and one integer revision update. Do not store a JSON payload or append a snapshot row solely for delivery. Verification must compare hot-path database-call counts before and after the change and confirm that no synchronous UI-thread work is added.

## ProgressSyncWorker

Create `src/services/ProgressSyncWorker.ts` and export a lowercase singleton `progressSyncWorker`.

The worker owns:

- whether authenticated draining is enabled;
- the authenticated user ID for the current server account;
- the periodic two-minute timer;
- an in-memory single-flight drain promise;
- retry eligibility and backoff calculation;
- selection and ordered processing of pending session revisions;
- progress-upload, acknowledgement, and post-upload reconciliation calls.

Expose a small lifecycle API:

- `start(userId: string): void` — enable authenticated work, request an immediate drain, and start the periodic timer idempotently.
- `stop(): void` — disable authenticated work and clear the timer; local database writes remain available.
- `requestDrain(trigger: ProgressSyncTrigger): void` — coalesce concurrent triggers into the current or next drain and return immediately.
- `drainNow(): Promise<void>` — testable drain entry point; no-op when disabled.

`ProgressSyncTrigger` is a diagnostic union containing `authentication`, `network`, `foreground`, `periodic`, `pause`, `end`, and `manual`.

`start()` must request the authentication-triggered drain before waiting for the first periodic interval. The first drain after every `start()` uses the duplicate-safe local-session snapshot adapter for retained pending work; this covers runtime reauthentication and authenticated app restart without requiring an in-memory history of when the revision was written. `stop()` must prevent queued or newly requested drains from beginning another network operation. A request already in flight may finish; its revision-safe acknowledgement remains valid, but the worker must not start the next row after being disabled.

## Local write and drain flow

For each outbound-relevant local mutation:

1. Update the listening-session row.
2. Increment its outbox `desired_revision` in the same transaction.
3. Commit before requesting any network work.
4. Notify the worker of an appropriate drain trigger.
5. If the worker is disabled, retain the revision without error or network activity.

For each eligible outbox row:

1. Read a consistent session snapshot and capture `desired_revision` as `sentRevision`.
2. Recheck that the worker is enabled for that row's user.
3. Select the delivery adapter:
   - Use `/api/session/local` with the stable local UUID for the first drain after `start()`, every retry after an ambiguous result, and all work retained across auth suspension or process restart.
   - Use `/api/session/:id/sync` at most once for a first-attempt update to an active server-backed session that has remained continuously authenticated.
4. Acknowledge exactly `sentRevision` only after the selected progress upload succeeds or is idempotently confirmed.
5. Fetch the resulting server media progress and upsert it through the existing media-progress helper.
6. Continue draining if the row or another row remains eligible.

Closing an active server session is lifecycle cleanup, not part of durable progress acknowledgement. A close failure must not cause replay of an already accepted additive live-sync request. Retry close only when the server exposes duplicate-safe close semantics; otherwise allow the server's existing stale-session cleanup to remove the abandoned open session.

If a local update increments `desired_revision` during step 3, acknowledging `sentRevision` leaves `desired_revision > acknowledged_revision`, and the worker sends the newer snapshot in the same drain when still eligible.

## Authentication and lifecycle integration

`AuthProvider` remains the owner of the authentication boundary:

- On transition to `authenticated`, call `progressSyncWorker.start(userId)`.
- On transition to `reauthRequired`, `signedOut`, or provider teardown, call `progressSyncWorker.stop()`.
- A retained username or local user row is never sufficient to start the worker.
- Successful reauthentication immediately drains the retained user's pending rows before relying on the periodic timer.

Remove progress-upload ownership from `ProgressService.initialize()` and `ProgressService.shutdown()`. `ProgressService` continues owning session creation, local progress calculation, resume-position logic, and local mutation orchestration, but delegates all server delivery to the worker.

Remove direct progress API calls from `PlayerBackgroundService` and other playback paths. They may request a drain after the local transaction commits, but they must not decide whether credentials are usable or call synchronization endpoints themselves.

Foreground and network-recovery hooks request a worker drain only while authenticated. Server-to-local refresh may run after the outbound drain so the server's reconciled progress becomes the displayed resume position.

## Retry and failure classification

Use bounded exponential backoff for transient failures:

- First retry: 15 seconds.
- Double the delay after each consecutive failure.
- Cap the delay at 15 minutes.
- Apply random jitter of plus or minus 20 percent.
- Reset `attempt_count`, `next_attempt_at`, and `last_error` after successful acknowledgement.

Classify failures as follows:

- **Authentication rejection:** stop the worker through the existing terminal-auth transition. Do not increment the outbox attempt count or apply a retry deadline; reauthentication triggers the next attempt immediately.
- **Offline or unreachable network:** retain the row. Connectivity recovery requests a new drain. Do not count an attempt when no request was sent.
- **Timeout, 5xx, or other transient transport failure:** increment attempts, store the error, and schedule backoff.
- **Rate limiting:** honor `Retry-After` when present; otherwise use the bounded backoff.
- **Remote media permanently missing:** acknowledge the captured revision, set `terminal_reason = "media_missing"`, retain the diagnostic row, and stop retrying automatically. This preserves the current behavior without falsely reporting an ordinary successful sync.
- **Duplicate or already-applied stable session ID:** treat as idempotent success only when the response proves it refers to the same local session.
- **Malformed local data:** set a specific terminal reason and log the non-sensitive identifiers needed for diagnostics; do not retry indefinitely.

Expected auth suspension is a lifecycle state, not a synchronization error.

## API idempotency and ordering

Current Audiobookshelf server behavior confirms that `/api/session/local` is an idempotent snapshot upsert for a stable session UUID: the server looks up the playback session by the supplied ID, inserts it when absent, and otherwise replaces `currentTime`, `timeListening`, and `updatedAt`. It also refuses to replace media progress when the server already has a newer progress timestamp. Preserve that compatibility contract in endpoint tests and document the minimum supported server behavior.

The client contract is:

- Always reuse the local session UUID across retries.
- Send absolute position and cumulative listening-time values, not client-side deltas that could be double-applied.
- Treat remote acceptance as provisional until the local captured revision is acknowledged.
- Route durable retries through `/api/session/local`, including work deferred after an already-playing server-backed session crosses into `reauthRequired`.

`/api/session/:id/sync` has different semantics: the server adds the supplied `timeListened` value to the open session. Replaying the same request can therefore double-count listening time. Do not put additive live-session sync requests into the durable retry queue. Continuously authenticated live synchronization may use that endpoint through the worker, but any work deferred by auth loss, app termination, or an ambiguous transport result must be represented and retried as a stable `/api/session/local` snapshot. An already-playing server-backed session that crosses into `reauthRequired` must persist its deferred portion under its stable local session UUID and use the local-session adapter after reauthentication.

If a supported Audiobookshelf version does not provide duplicate-safe `/api/session/local` behavior for a stable session ID, that version cannot receive the crash-safe guarantee without an upstream idempotency change. Client-side timing alone cannot provide exactly-once behavior across a network boundary.

Server references:

- [Audiobookshelf SessionController](https://github.com/advplyr/audiobookshelf/blob/master/server/controllers/SessionController.js)
- [Audiobookshelf PlaybackSessionManager](https://github.com/advplyr/audiobookshelf/blob/master/server/managers/PlaybackSessionManager.js)

## Multi-device reconciliation

The outbox guarantees delivery of local listening sessions; it does not make the client the sole authority for global media progress.

After a local session revision is accepted:

1. Fetch the server's resulting media progress.
2. Upsert that response into the existing local media-progress table.
3. Use the server result as the reconciled resume position shown across devices.
4. Retain the local listening-session record for history and diagnostics.

Do not discard a local listening session merely because another device currently has a newer resume position. Upload the stable session record so listening history is preserved, then accept the server's reconciliation result. Do not manufacture a second local session solely to win a progress conflict.

## Compatibility and rollout

- Keep the legacy `is_synced`, `sync_attempts`, `last_sync_attempt`, `last_sync_time`, and `sync_error` columns during the first release of the outbox.
- Stop using those columns for queue selection immediately after migration.
- Where existing diagnostics display them, derive compatibility values from outbox revisions and retry metadata.
- Add tagged logs containing session ID, library item ID, sent revision, desired revision, acknowledged revision, trigger, attempt, and result. Do not log tokens or request authorization data.
- Add a diagnostic query or export representation for pending, backed-off, and terminal outbox rows using the existing redacted diagnostics path.
- A later cleanup todo may remove the legacy columns after device migration and field verification demonstrate that the outbox is authoritative.

## Public and internal interfaces

- No user-facing route or component contract changes are required.
- `AuthStatus` and the current `reauthRequired` behavior remain unchanged.
- Add internal `ProgressSyncTrigger` and outbox row types.
- Add the `progressSyncWorker` lifecycle described above.
- Replace `getUnsyncedSessions()` as the synchronization selector with outbox-based helpers.
- Keep `forceSyncSessions()` only as a diagnostic/manual worker drain; it must still respect authentication and must not bypass revision acknowledgement.

## Automated test plan

### Database helpers and migration

- Migration creates and backfills the outbox on an empty database.
- A clearly synchronized historical row is backfilled with equal desired and acknowledged revisions.
- Unsynced, never-synced, failed, ended-after-sync, and updated-after-sync historical rows are backfilled pending.
- Starting a session inserts the session and outbox row atomically.
- Position, listening-time, pause/end, and stale-end mutations advance the desired revision atomically.
- A forced database failure rolls back both the session mutation and revision advance.
- Server reconciliation does not advance the desired revision.
- Acknowledging revision N while desired revision N+1 exists leaves the row pending.
- Foreign-key deletion removes the outbox row with its session/user.
- A one-second playback tick updates position, listening time, and desired revision in one transaction and advances the revision only once.

### Worker behavior

- The worker performs no network request before `start()` or after `stop()`.
- Multiple calls to `start()` and `requestDrain()` create one timer and one concurrent drain.
- `start()` drains immediately rather than waiting two minutes.
- A session that was synced before expiry, advanced locally during reauthentication, and ended before login uploads after reauthentication.
- A local update written during an in-flight request remains pending after the older revision succeeds.
- A crash/restart simulation retries an unacknowledged stable session without creating a duplicate logical session.
- Repeating a local-session snapshot with the same UUID updates the existing logical session.
- An additive live-session sync is never replayed through the durable retry queue after an ambiguous result.
- Authentication rejection stops draining without incrementing retry metadata.
- Transient errors retain the revision and apply the specified backoff.
- Network recovery, foreground, pause/end, periodic, and manual triggers all converge on the same single-flight drain.
- A terminal media-missing response records `terminal_reason` and stops retrying that revision.
- Successful upload acknowledges only the sent revision, clears transient retry state, and refreshes server progress.

### Integration regression

- Expire credentials during downloaded playback after at least one successful progress sync.
- Continue listening long enough to advance both position and listening time.
- Pause and end playback while `reauthRequired`; assert local state advances without any authenticated endpoint call.
- Force-quit and reconstruct `reauthRequired`; assert the outbox remains pending.
- Reauthenticate; assert the worker uploads immediately and the acknowledged revision catches up.
- Advance playback during that upload; assert the newer revision is subsequently uploaded.
- Confirm explicit logout deletes the local session and pending outbox row rather than syncing it under a future user.

## Manual acceptance

1. Start a downloaded audiobook while authenticated and wait for one confirmed server progress update.
2. Invalidate the token, continue listening, pause, resume, and stop without signing in.
3. Confirm the server position does not change and the app makes no progress-sync requests while the session-expired indicator is present.
4. Force-quit and relaunch. Confirm local resume uses the latest offline position and the session remains pending.
5. Sign in through the reauthentication sheet. Confirm the pending upload starts immediately, the sheet dismisses, and the current route remains unchanged.
6. Confirm the server receives the offline listening session and the local acknowledged revision reaches the desired revision.
7. Repeat with the server temporarily unreachable after login. Confirm retry metadata persists across relaunch and synchronization succeeds after connectivity returns.
8. Update the same title from another device during the expired interval. Confirm SideShelf uploads its local session history and then displays the server-reconciled progress without creating duplicate sessions.

## Completion criteria

- No progress-related server request can originate outside the authenticated worker.
- Every outbound-relevant local mutation advances a durable desired revision atomically.
- Reauthentication requests an immediate drain.
- An older successful request cannot acknowledge a newer local mutation.
- Pending work survives app termination and restart.
- Retry behavior is bounded, observable, and auth-aware.
- Existing offline playback, resume-position recovery, explicit logout, and server-progress reconciliation behavior remain intact.
- The one-second progress hot path remains asynchronous and does not add an unbounded row or payload write per tick.
- Generated migration, helper tests, worker tests, auth lifecycle tests, progress hot-path tests, full Jest, scoped ESLint, changed-file TypeScript, and circular-import checks all pass before the todo moves to done.
