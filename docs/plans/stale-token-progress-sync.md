# Durable Progress Synchronization

**Status:** Implemented on 2026-07-20 in merge `0e1e128`

## Purpose

SideShelf must retain listening progress while authentication is unavailable, across app termination, and while an older upload is in flight. The implementation replaces the old `is_synced` queue signal with a versioned transactional outbox and one auth-aware delivery worker.

The historical implementation sequence is preserved in the [implementation plan](../superpowers/plans/2026-07-20-stale-token-progress-sync-recovery.md). This document is the maintained architecture and invariant record.

## Problem Solved

The former boolean could remain true after newer local playback writes, so progress accumulated during `reauthRequired` could be omitted permanently. It also allowed an older successful response to mark a session synchronized after a newer local mutation occurred.

The outbox separates two facts:

- `desired_revision`: latest locally committed outbound state;
- `acknowledged_revision`: highest captured revision accepted or deliberately terminally resolved.

A row is pending while `desired_revision > acknowledged_revision`, it has no terminal reason, and its retry deadline is eligible.

## Required Invariants

1. Every outbound-relevant listening-session mutation and its `desired_revision` increment commit in one SQLite transaction.
2. Network work starts only after that transaction commits.
3. The worker captures `sentRevision` with a consistent session snapshot.
4. Acknowledgement advances to `sentRevision`, never to whatever desired revision exists when the response arrives.
5. A newer local write during upload remains pending after the older response succeeds.
6. Authentication suspension stops network work without preventing local writes.
7. Process restart reconstructs pending work entirely from SQLite.
8. Every retry reuses the stable local session UUID.
9. Only the authenticated local user may be drained.
10. Explicit logout deletes pending outbox rows and listening sessions before parent content rows.

Delivery is at least once. The stable UUID plus the duplicate-safe local-session endpoint provides logical idempotency.

## Data Model

`progress_sync_outbox` has one row per local listening session:

| Column                     | Meaning                                                   |
| -------------------------- | --------------------------------------------------------- |
| `session_id`               | Stable local UUID and primary key                         |
| `user_id`                  | Authenticated-user partition                              |
| `desired_revision`         | Latest locally committed outbound revision                |
| `acknowledged_revision`    | Highest accepted or terminally resolved captured revision |
| `attempt_count`            | Consecutive transient failures for the pending revision   |
| `last_attempt_at`          | Most recent transmitted attempt                           |
| `next_attempt_at`          | Earliest retry eligibility                                |
| `last_success_at`          | Most recent acknowledgement                               |
| `last_error`               | Redacted diagnostic detail                                |
| `terminal_reason`          | Explicit non-retry outcome                                |
| `created_at`, `updated_at` | Stable ordering and diagnostics                           |

Non-null additions have defaults so upgraded SQLite databases can apply the schema safely. Queue selection joins the outbox to `local_listening_sessions`, filters by user and revision, excludes terminal rows, respects `next_attempt_at`, and processes sessions in creation order.

Legacy session sync columns remain compatibility data during the initial rollout but are not authoritative queue state.

## Local Mutation Boundary

All session and outbox writes go through `src/db/helpers/`; services do not issue inline Drizzle mutations.

- Session creation inserts the listening session and outbox row atomically.
- Each playback tick updates position, cumulative listening time, rate, and volume while incrementing the desired revision once.
- Pause/end/stale-end mutations advance the revision in the same transaction as their session changes.
- Server-originated reconciliation uses separate helpers and does not enqueue an outbound revision.
- A session that already has server bookkeeping is still uploaded normally; it is never pre-acknowledged without a delivery.

The hot path coalesces state in one row rather than appending payload snapshots per second.

## Worker Ownership

`ProgressSyncWorker` owns authenticated delivery lifetime and scheduling:

- `start(userId)` enables one user, increments the lifecycle generation, starts the periodic timer, and requests an immediate authentication drain;
- `stop()` disables delivery, invalidates the generation, clears timers, and leaves durable rows untouched;
- `requestDrain(trigger)` coalesces triggers into the active or next pass;
- `requestDrainAndWait(trigger)` is the awaitable lifecycle/manual boundary;
- `drainNow()` is the testable no-op-when-disabled entry point.

There is one in-memory single-flight drain promise and no persisted lease. The application has one JavaScript process and one worker singleton; after a crash, revision state reconstructs eligibility without a stale in-flight marker.

The generation and user ID are rechecked before upload, acknowledgement, reconciliation, and the next row. Stopping or switching users cannot begin another delivery under the obsolete generation.

## Triggers and Cadence

Triggers include authentication, network recovery, foreground, periodic, pause, end, manual, and live progress.

- Authentication requests an immediate drain.
- Periodic fallback runs every two minutes.
- Live progress schedules at most every 15 seconds on Wi-Fi/Ethernet and every 60 seconds on metered or unknown networks.
- Only the earliest wake deadline is retained.
- Concurrent triggers set a follow-up flag rather than create overlapping drains.

Foreground, background playback, and connectivity code may request work but do not select endpoints or decide whether credentials are usable.

## Delivery Protocol

For one eligible row, the worker:

1. Reads a consistent listening-session snapshot and captures `sentRevision`.
2. Validates stable IDs, numeric progress, timestamps, local media relation, user ownership, and minimum meaningful listening duration.
3. Confirms reachable network and obtains device enrichment.
4. Uploads the absolute snapshot through `/api/session/local` with the stable local session UUID.
5. Acknowledges exactly `sentRevision` after acceptance.
6. Fetches server media progress and updates the local resume view as best-effort reconciliation.
7. Continues in creation order while eligible work remains.

Acknowledgement deliberately precedes reconciliation. A refresh failure must not replay an already accepted upload; refresh work is retained separately in memory and the authenticated refresh path recovers it after restart.

### Single delivery adapter

The worker always uses `/api/session/local`. That endpoint upserts an absolute session snapshot keyed by the stable UUID.

`/api/session/:id/sync` is additive: replaying an ambiguous request can double-count listening time. It is therefore forbidden on every durable worker path, including first attempts, retries, retained work after auth loss, and process recovery. Closing an open server session is separate lifecycle cleanup and cannot control outbox acknowledgement.

## Retry and Terminal Outcomes

Transient failures use exponential backoff from 15 seconds, capped at 15 minutes, with plus or minus 20 percent jitter. A valid `Retry-After` value overrides the calculated delay. Success resets attempts, deadlines, and error metadata.

| Outcome                               | Policy                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Stale token / 401 / 403               | Stop delivery and return to the authentication lifecycle; no retry count |
| Offline before request                | Retain without counting an attempt; network recovery retriggers          |
| Timeout, transport error, or 5xx      | Record failure and schedule backoff                                      |
| 429                                   | Honor `Retry-After` or bounded backoff                                   |
| Remote media missing                  | Terminally resolve as `media_missing`                                    |
| Malformed local identifiers or values | Terminally resolve as `malformed_local_data`                             |
| Less than five seconds of listening   | Terminally resolve as `too_short`                                        |
| Missing local media relation          | Terminally resolve as `local_media_missing`                              |

Terminal resolution acknowledges only the captured revision. A concurrent newer revision clears the terminal effect for the newer work rather than being silently discarded.

## Authentication Lifecycle

`AuthProvider` owns the boundary:

- authenticated starts the worker for the matched local user;
- `reauthRequired`, signed out, server switch, or provider teardown stops it;
- retained username or user rows are insufficient authorization;
- successful reauthentication immediately drains retained revisions.

`ProgressService` owns session creation, local calculations, restoration, and transactional mutation orchestration. It does not own server delivery. Playback/background paths commit locally first and then notify the worker.

Expected auth suspension is not logged or counted as an ordinary sync failure.

## Multi-Device Reconciliation

Accepted local listening sessions preserve listening history; they do not unconditionally win global resume position. After acknowledgement, the client fetches the server's resulting media progress and upserts that result locally. A newer server timestamp from another device remains authoritative for resume position without deleting the local listening record.

## Foreign Keys and Logout

The schema declares cascades, but production and test clients currently do not enable `PRAGMA foreign_keys`. Cascades therefore document intent but are not a cleanup mechanism.

`wipeUserData()` explicitly deletes `progress_sync_outbox` and then `local_listening_sessions` before related parent content. This prevents one account's retained listening data from being delivered under a future account.

Enabling foreign keys globally remains separate work. It requires:

- auditing existing upgraded databases for latent violations;
- applying any required cleanup migration;
- enabling the same pragma in production and test clients;
- including `local_progress_snapshots` and every other declared relationship in the audit.

Until that audit is complete, new cleanup paths must remain explicit and child-before-parent.

## Migration and Backfill

Migration `0015_silent_next_avengers.sql` creates the outbox and backfills one row per existing listening session.

- Cleanly synchronized rows begin with desired and acknowledged revision both at 1.
- Active, ended-but-unsynchronized, error, and ambiguous rows begin pending at desired 1 and acknowledged 0.
- The clean-row predicate depends on `updated_at <= last_sync_time`; historical synchronization wrote the same `Date` to both fields, so equality is intentional and tested.
- The backfill is separated from DDL with the Drizzle statement-breakpoint marker.
- Empty databases and databases upgraded through older migration histories are covered.

Generated migrations must be edited before they are shipped or applied because the journal records content identity.

## Public and Internal Boundaries

No user-facing route contract changed. The existing `AuthStatus` and dismissible reauthentication behavior remain.

Internal boundaries include:

- `progressSyncWorker` lifecycle and trigger union;
- atomic listening-session/outbox helpers;
- outbox diagnostic rows and terminal reasons;
- `forceSyncSessions()` as an authenticated manual drain rather than a bypass;
- stable endpoint error classification through `ApiResponseError`.

## Verification Contract

The implementation is covered by helper, migration, worker-delivery, worker-lifecycle, hot-path, auth-provider, progress-provider, and restart/reauth integration tests. Critical behaviors include:

- atomic rollback of session plus revision updates;
- acknowledgement of N while N+1 remains pending;
- crash/restart retry with the same UUID;
- no `/api/session/:id/sync` call from the worker;
- immediate drain after authentication and network recovery;
- no request while disabled or under an obsolete user generation;
- explicit logout deletion with foreign keys disabled;
- deterministic migration classification;
- acknowledgement before best-effort reconciliation;
- bounded retry scheduling and terminal error classification.

The device and server-side scenarios are maintained in the [stale-token progress-sync test plan](stale-token-progress-sync-test-plan.md).

## Follow-Up

- Complete the foreign-key audit described above before enabling enforcement.
- Remove legacy session sync columns only after field verification confirms the outbox is authoritative on upgraded devices.
- Revalidate `/api/session/local` stable-ID idempotency when changing the minimum supported Audiobookshelf server version.
