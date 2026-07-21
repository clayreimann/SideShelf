# Stale-Token Progress Sync Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lossy `is_synced` queue with a versioned transactional outbox that preserves downloaded-playback progress through token expiry, restart, retry, and concurrent local updates.

**Architecture:** `local_listening_sessions` remains the payload source of truth while one `progress_sync_outbox` row per session records desired and acknowledged revisions. Synchronous Expo/Drizzle transactions atomically mutate each session and advance its revision; an auth-aware singleton worker is the only owner of `/api/session/local` delivery, retry scheduling, and post-upload reconciliation. `AuthProvider` enables that worker only after a confirmed account identity is paired with valid credentials, while playback paths remain local-first and merely request coalesced drains after commits.

**Tech Stack:** TypeScript 5.9, React Native 0.81 / Expo 54, Drizzle ORM 0.44 with expo-sqlite 16, Jest 29, React Native Testing Library, NetInfo.

## Global Constraints

- Treat `docs/plans/stale-token-progress-sync.md` as the maintained architecture record; do not change the expired-session UI, login-sheet UX, or streaming playback gate.
- Delivery is at least once. Always reuse the local session UUID and always upload through `/api/session/local`; worker code must never call `/api/session/:id/sync`.
- A local outbound mutation and its `desired_revision` increment must commit in the same SQLite transaction.
- Expo Drizzle transactions are synchronous: transaction callbacks must not be `async`; every statement inside uses `.run()`, and failures throw before commit.
- Acknowledge only the captured `sentRevision`; never substitute the row's current `desired_revision`.
- Retain one outbox row per session. Do not store JSON payloads or append one delivery row per playback tick.
- Preserve the legacy `is_synced`, retry, and server-session columns for compatibility, but never use them as the authoritative pending selector.
- The worker operates only for the confirmed authenticated user ID, stops on `reauthRequired`/`signedOut`/teardown, and performs no network operation while disabled.
- A request already in flight may finish and acknowledge its captured revision after `stop()`, but it must not start another row.
- Live progress requests use a `progress` diagnostic trigger and are coalesced by the worker to the existing cadence: 15 seconds on Wi-Fi/Ethernet and 60 seconds on metered connections. Other triggers may drain immediately.
- Transient retry starts at 15 seconds, doubles per consecutive failure, caps at 15 minutes, and applies jitter in `[0.8, 1.2]`. `Retry-After` overrides the computed delay when valid.
- Expected auth suspension and offline detection before a request do not increment attempts or populate error fields.
- Terminally resolve unsendable rows with stable reasons: `media_missing`, `local_media_missing`, `too_short`, or `malformed_local_data`.
- Explicit logout and server switch stop the worker and await `wipeUserData()`; that helper explicitly deletes outbox rows before listening sessions. Do not enable `PRAGMA foreign_keys` in this work.
- Do not add a durable retry for `/api/session/:id/close`; allow the server's stale-session cleanup to close abandoned live sessions.
- All database writes stay in `src/db/helpers/`; services import specific helper files, never the `@/db/helpers` barrel.
- Use tagged logging, not new `console.*` calls.
- Preserve unrelated user changes in the original checkout; implementation occurs on `codex/stale-token-progress-sync` in `.worktrees/stale-token-progress-sync`.

---

### Task 1: Journal the outbox schema, historical backfill, and orphaned path normalization

**Files:**

- Modify: `src/db/schema/localData.ts`
- Generate: `src/db/migrations/0015_*.sql`
- Generate: `src/db/migrations/meta/0015_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`
- Modify: `src/db/migrations/migrations.js`
- Delete: `src/db/migrations/0014_normalize_paths.sql`
- Modify: `src/db/helpers/__tests__/normalizePaths.test.ts`
- Create: `src/db/helpers/__tests__/progressSyncOutboxMigration.test.ts`

**Interfaces:**

- Produces: `progressSyncOutbox`, `ProgressSyncOutboxRow`, and `NewProgressSyncOutboxRow` from `@/db/schema/localData`.
- Produces: a runtime-bundled `0015` migration containing the generated table/index DDL, the outbox backfill, and the six formerly orphaned path-normalization statements.

- [ ] **Step 1: Add failing migration-contract tests**

Create a pre-`0015` in-memory fixture that applies bundled migrations through `0014_milky_texas_twister`, inserts active, ended, cleanly synced, and ambiguous session rows, then applies the new SQL using `--> statement-breakpoint` splitting. Assert:

```ts
expect(rows).toEqual([
  expect.objectContaining({ sessionId: "clean", desiredRevision: 1, acknowledgedRevision: 1 }),
  expect.objectContaining({ sessionId: "active", desiredRevision: 1, acknowledgedRevision: 0 }),
  expect.objectContaining({ sessionId: "ended", desiredRevision: 1, acknowledgedRevision: 0 }),
  expect.objectContaining({ sessionId: "ambiguous", desiredRevision: 1, acknowledgedRevision: 0 }),
]);
expect(clean.updatedAt.getTime()).toBe(clean.lastSyncTime?.getTime());
```

Also assert that an empty pre-migration database migrates successfully, `migrations.js` contains the journaled `0015` tag, every appended statement is separated by a breakpoint, and path normalization now executes through the runtime migration rather than by directly reading an orphan file.

- [ ] **Step 2: Run the migration tests and verify the expected red state**

Run:

```bash
npx jest --runTestsByPath src/db/helpers/__tests__/progressSyncOutboxMigration.test.ts src/db/helpers/__tests__/normalizePaths.test.ts --runInBand
```

Expected: FAIL because `progress_sync_outbox` and journaled `0015` do not exist.

- [ ] **Step 3: Add the schema and generate the migration**

Add the table with camelCase Drizzle properties mapped to the exact snake-case columns in the design, all required defaults, both documented cascades, and:

```ts
index("progress_sync_outbox_user_retry_idx").on(table.userId, table.nextAttemptAt);
```

Export both inferred row types. Run `npm run drizzle:generate` once; do not hand-create a parallel migration.

- [ ] **Step 4: Complete the generated migration before applying it**

Append a breakpoint and deterministic backfill:

```sql
INSERT INTO `progress_sync_outbox` (
  `session_id`, `user_id`, `desired_revision`, `acknowledged_revision`,
  `attempt_count`, `created_at`, `updated_at`
)
SELECT
  `id`, `user_id`, 1,
  CASE
    WHEN `is_synced` = 1
      AND `last_sync_time` IS NOT NULL
      AND `updated_at` <= `last_sync_time`
    THEN 1 ELSE 0
  END,
  0, `created_at`, `updated_at`
FROM `local_listening_sessions`;
```

Move the six statements from `0014_normalize_paths.sql` into the same journaled file, with a breakpoint before every statement; delete the orphan and register/import `0015` in `migrations.js`.

- [ ] **Step 5: Verify schema/migration behavior**

Run the focused command from Step 2 and `npm run drizzle:generate` again. Expected: focused tests PASS and the second generate reports no additional schema change.

- [ ] **Step 6: Commit the migration unit**

```bash
git add src/db/schema/localData.ts src/db/migrations src/db/helpers/__tests__/normalizePaths.test.ts src/db/helpers/__tests__/progressSyncOutboxMigration.test.ts
git commit -m "feat: add progress sync outbox migration"
```

### Task 2: Build atomic session/outbox helpers and explicit logout cleanup

**Files:**

- Create: `src/db/helpers/progressSyncOutbox.ts`
- Modify: `src/db/helpers/localListeningSessions.ts`
- Modify: `src/db/helpers/wipeUserData.ts`
- Create: `src/db/helpers/__tests__/progressSyncOutbox.test.ts`
- Create: `src/db/helpers/__tests__/localListeningSessions.test.ts`
- Create: `src/db/helpers/__tests__/wipeUserData.test.ts`

**Interfaces:**

- Produces: `PendingProgressSync` with `{ outbox: ProgressSyncOutboxRow; session: LocalListeningSessionRow; sentRevision: number }`.
- Produces: `getNextEligibleProgressSync(userId: string, now: Date): Promise<PendingProgressSync | null>` ordered by session `createdAt`.
- Produces: `recordProgressSyncFailure(sessionId: string, attemptedAt: Date, nextAttemptAt: Date, error: string): Promise<void>`.
- Produces: `acknowledgeProgressSyncRevision(sessionId: string, sentRevision: number, succeededAt: Date): Promise<void>`.
- Produces: `terminallyResolveProgressSyncRevision(sessionId: string, sentRevision: number, reason: ProgressSyncTerminalReason, resolvedAt: Date, error?: string): Promise<void>`.
- Produces: `startListeningSession(...)`, `applyLocalPlaybackTick(...)`, `endListeningSession(...)`, and `endStaleListeningSession(...)` as atomic session-plus-revision operations.
- Produces: distinct non-dirty helpers `reconcileSessionPositionFromServer`, `resetSessionListeningTime`, and `updateServerSessionId` that never advance `desiredRevision`.

- [ ] **Step 1: Write failing real-database helper tests**

Use `createTestDb()` and real helpers to prove:

```ts
const sessionId = await startListeningSession(...);
expect(await getOutbox(sessionId)).toMatchObject({ desiredRevision: 1, acknowledgedRevision: 0 });

await applyLocalPlaybackTick(sessionId, {
  currentTime: 42,
  listeningTimeDelta: 1.25,
  playbackRate: 1.5,
  volume: 0.8,
});
expect(await getListeningSession(sessionId)).toMatchObject({ currentTime: 42, timeListening: 1.25 });
expect(await getOutbox(sessionId)).toMatchObject({ desiredRevision: 2 });
```

Cover local end and stale-end revision increments, same-user ordering, cross-user exclusion, retry eligibility, reconciliation not incrementing, missing-outbox rollback, forced second-statement failure rollback, N acknowledgement while desired N+1 stays pending, terminal resolution, and a wipe followed by direct queries proving both session and outbox rows are gone.

- [ ] **Step 2: Run helper tests and verify they fail for missing APIs**

```bash
npx jest --runTestsByPath src/db/helpers/__tests__/progressSyncOutbox.test.ts src/db/helpers/__tests__/localListeningSessions.test.ts src/db/helpers/__tests__/wipeUserData.test.ts --runInBand
```

Expected: FAIL on missing outbox and atomic helper exports.

- [ ] **Step 3: Implement synchronous transaction helpers**

Every atomic method must follow this shape:

```ts
db.transaction((tx) => {
  const sessionResult = tx.update(localListeningSessions).set(sessionChanges).where(...).run();
  if (sessionResult.changes !== 1) throw new Error(`Session ${sessionId} not found`);

  const outboxResult = tx.update(progressSyncOutbox).set({
    desiredRevision: sql`${progressSyncOutbox.desiredRevision} + 1`,
    attemptCount: 0,
    nextAttemptAt: null,
    lastError: null,
    terminalReason: null,
    updatedAt: now,
  }).where(eq(progressSyncOutbox.sessionId, sessionId)).run();
  if (outboxResult.changes !== 1) throw new Error(`Outbox ${sessionId} not found`);
});
```

Use SQL arithmetic for `timeListening` and revisions. No `await` may appear inside these transaction callbacks.

- [ ] **Step 4: Implement revision-safe delivery helpers**

Selection joins session/outbox, filters exact user, pending revision, null terminal reason, and due retry, then orders by `localListeningSessions.createdAt`. Acknowledgement must use a monotonic conditional update equivalent to:

```ts
acknowledgedRevision: sql`max(${progressSyncOutbox.acknowledgedRevision}, ${sentRevision})`;
```

and must never read/copy desired revision. Success clears retry/error fields; transient failure changes only attempt diagnostics; terminal resolution acknowledges at most `sentRevision` and records the reason.

- [ ] **Step 5: Extend explicit wiping**

Import `progressSyncOutbox` and `localListeningSessions`; delete outbox first, then sessions, before parent content tables. Do not rely on cascades and do not enable foreign keys. Leave `local_progress_snapshots` for the explicitly required follow-up audit.

- [ ] **Step 6: Verify and commit the helper unit**

Run Step 2's tests, then:

```bash
git add src/db/helpers src/db/helpers/__tests__
git commit -m "feat: make listening progress mutations transactional"
```

### Task 3: Preserve HTTP classification and stable-session identity in the endpoint layer

**Files:**

- Modify: `src/lib/api/endpoints.ts`
- Create: `src/lib/api/__tests__/progressSessionEndpoints.test.ts`

**Interfaces:**

- Produces: `ApiResponseError extends Error` with `status`, `retryAfter`, and redacted `responseBody` fields.
- Produces: `createLocalSession(params): Promise<{ id: string; duplicate: boolean }>` where any duplicate success is accepted only when the response identifies the same stable session UUID.

- [ ] **Step 1: Write failing endpoint-contract tests**

Mock `apiFetch` and assert the adapter sends absolute `currentTime` and cumulative `timeListening`, reuses `params.sessionId` as body `id`, returns same-ID success, rejects mismatched duplicate identity, and exposes 401, 404, 429 plus `Retry-After`, and 5xx without leaking unredacted bodies.

- [ ] **Step 2: Verify the red state**

```bash
npx jest --runTestsByPath src/lib/api/__tests__/progressSessionEndpoints.test.ts src/lib/api/__tests__/endpoints.redaction.test.ts --runInBand
```

Expected: FAIL because endpoint errors currently collapse status and headers into plain `Error`.

- [ ] **Step 3: Implement the typed error without weakening existing redaction**

Have `handleResponseError()` throw `ApiResponseError`, parse integer seconds or HTTP-date `Retry-After`, and retain only `redactBody(text)` in the error object. Keep all existing endpoint callers source-compatible as ordinary `Error` consumers.

- [ ] **Step 4: Make local-session response identity explicit**

Parse a successful JSON response when present. Treat an empty-body 2xx as acceptance of the submitted ID. For a duplicate/conflict response, return idempotent success only if the response body proves the same session ID; otherwise throw the typed error.

- [ ] **Step 5: Verify and commit**

Run Step 2's tests, then:

```bash
git add src/lib/api/endpoints.ts src/lib/api/__tests__/progressSessionEndpoints.test.ts
git commit -m "feat: expose progress upload response metadata"
```

### Task 4: Implement worker lifecycle, trigger coalescing, and scheduling

**Files:**

- Create: `src/services/ProgressSyncWorker.ts`
- Create: `src/services/__tests__/ProgressSyncWorker.lifecycle.test.ts`

**Interfaces:**

- Produces: `ProgressSyncTrigger = "authentication" | "network" | "foreground" | "periodic" | "pause" | "end" | "manual" | "progress"`.
- Produces: lowercase singleton `progressSyncWorker` with `start(userId): void`, `stop(): void`, `requestDrain(trigger): void`, and `drainNow(): Promise<void>`.
- Consumes: Task 2 pending-selection helper; Task 5 completes row delivery.

- [ ] **Step 1: Write fake-timer lifecycle tests**

Assert immediate authentication drain before the first interval, idempotent same-user start, stop/teardown clearing periodic/live/retry timers, disabled `drainNow()` no-op, one in-flight drain at a time, triggers during a drain coalescing into exactly one follow-up pass, different-user start stopping the old generation, and no next-row start after stop.

- [ ] **Step 2: Verify the worker tests fail**

```bash
npx jest --runTestsByPath src/services/__tests__/ProgressSyncWorker.lifecycle.test.ts --runInBand
```

Expected: FAIL because the worker does not exist.

- [ ] **Step 3: Implement generation-safe lifecycle state**

Keep only in-memory state:

```ts
private enabledUserId: string | null = null;
private generation = 0;
private drainPromise: Promise<void> | null = null;
private drainRequested = false;
private periodicTimer: ReturnType<typeof setInterval> | null = null;
private wakeTimer: ReturnType<typeof setTimeout> | null = null;
```

`start()` increments the generation on identity change, schedules the two-minute safety interval, and requests `authentication` immediately. `stop()` clears enabled identity and timers and increments generation. `_drain(generation, userId)` checks both values before selection and before every next row.

- [ ] **Step 4: Add worker-owned live and retry wakes**

`progress` requests coalesce into the current/next drain but respect 15-second unmetered or 60-second metered eligibility. A due `nextAttemptAt` schedules the earliest one-shot wake so the first 15-second retry is not delayed by the periodic timer. Connectivity checks that prove offline schedule no attempt metadata.

- [ ] **Step 5: Verify timer cleanup and commit**

Run Step 2's test and assert `jest.getTimerCount()` returns zero after `stop()` in every test. Then:

```bash
git add src/services/ProgressSyncWorker.ts src/services/__tests__/ProgressSyncWorker.lifecycle.test.ts
git commit -m "feat: add auth-aware progress sync worker lifecycle"
```

### Task 5: Add worker delivery, revision acknowledgement, retry, and reconciliation

**Files:**

- Modify: `src/services/ProgressSyncWorker.ts`
- Create: `src/services/__tests__/ProgressSyncWorker.delivery.test.ts`
- Modify: `src/db/helpers/mediaProgress.ts` only if a narrow existing upsert adapter is needed

**Interfaces:**

- Consumes: `PendingProgressSync`, Task 2 acknowledgement/failure/terminal helpers, `createLocalSession`, `fetchMediaProgress`, `marshalMediaProgressFromApi`, and `upsertMediaProgress`.
- Produces: deterministic exported `calculateProgressRetryDelay(attemptCount, random, retryAfterMs?)` for unit testing.

- [ ] **Step 1: Write failing delivery tests**

Cover ordered same-item sessions, user partition, captured revision N acknowledged while N+1 remains pending and is sent next, restart retry with the same UUID, no `syncSession` call under any trigger, success reconciliation, stop during an in-flight request, offline preflight, auth rejection, 429, timeout/5xx, remote 404, malformed local rows, short sessions, and jitter boundaries.

Use a deferred endpoint promise for the race:

```ts
const upload = deferred<void>();
createLocalSessionMock.mockReturnValueOnce(upload.promise);
const drain = worker.drainNow();
await applyLocalPlaybackTick(sessionId, nextTick);
upload.resolve();
await drain;
expect(sentRevisions).toEqual([1, 2]);
```

- [ ] **Step 2: Verify the expected failures**

```bash
npx jest --runTestsByPath src/services/__tests__/ProgressSyncWorker.delivery.test.ts --runInBand
```

Expected: FAIL because row delivery/classification is incomplete.

- [ ] **Step 3: Implement the single snapshot adapter**

Build `/api/session/local` input from the captured joined snapshot: stable local ID, user/library/item IDs, absolute position, cumulative listening time, duration, and session timestamps. Never import or call `syncSession`. On success acknowledge `sentRevision`, then fetch/upsert server media progress; reconciliation failure is logged and retried as refresh work, not by replaying an already acknowledged upload.

- [ ] **Step 4: Implement exact failure classification**

- 401/403: stop the worker and let the existing token-clear transition drive reauth; do not write attempt diagnostics.
- Offline/unreachable before request: retain row unchanged; wait for network trigger.
- Timeout/5xx/transport: increment attempt count and persist computed wake.
- 429: honor valid `Retry-After`, otherwise computed backoff.
- Remote missing media: acknowledge captured revision and set `media_missing`.
- Missing local relations, malformed numbers/timestamps, or invalid IDs: set `local_media_missing` or `malformed_local_data`.
- Duration below five seconds of meaningful listening: set `too_short`.
- Duplicate: accept only Task 3's proven same-ID result.

- [ ] **Step 5: Verify and commit**

Run both worker suites and endpoint/helper suites, then:

```bash
git add src/services/ProgressSyncWorker.ts src/services/__tests__/ProgressSyncWorker.delivery.test.ts src/db/helpers/mediaProgress.ts
git commit -m "feat: deliver progress revisions with durable retries"
```

### Task 6: Make ProgressService local-only and integrate atomic mutations

**Files:**

- Modify: `src/services/ProgressService.ts`
- Modify: `src/services/__tests__/ProgressService.hotpath.test.ts`
- Modify: `src/services/__tests__/ProgressService.rehydration.test.ts`

**Interfaces:**

- Consumes: Task 2 atomic helpers and `progressSyncWorker.requestDrain()`.
- Produces: `ProgressService` retaining session/resume/local mutation orchestration but no timer, pending selector, endpoint import, authentication decision, or upload implementation.
- Produces: `forceSyncSessions()` as `requestDrain("manual")`; remove or redirect `syncSessionToServer()` so no public API performs a direct request.

- [ ] **Step 1: Rewrite tests to specify local-only behavior**

Assert session start always creates pending outbox work even with an existing server session ID, start/pause/duck/end/stale cleanup only mutate locally and request appropriate drains, rehydration never uploads, and no `createLocalSession`, `syncSession`, or `closeSession` endpoint is imported/called by `ProgressService`.

For the 1 Hz hot path, assert one helper call per tick:

```ts
expect(applyLocalPlaybackTick).toHaveBeenCalledTimes(1);
expect(updateSessionListeningTime).not.toHaveBeenCalled();
expect(updateSessionProgress).not.toHaveBeenCalled();
```

- [ ] **Step 2: Verify focused failures**

```bash
npx jest --runTestsByPath src/services/__tests__/ProgressService.hotpath.test.ts src/services/__tests__/ProgressService.rehydration.test.ts --runInBand
```

Expected: FAIL because current code owns timers/direct uploads and split writes.

- [ ] **Step 3: Replace split writes and refresh the hot-path cache**

Compute `listeningTimeDelta` once, call `applyLocalPlaybackTick()` once, and mirror current time, rate, volume, listening time, and `updatedAt` into `_cachedActiveSession`. Request a coalesced `progress` drain only after the transaction resolves.

- [ ] **Step 4: Remove every direct synchronization branch**

Remove `initialize`, periodic timer ownership, `syncSingleSession`, `syncUnsyncedSessions`, network eligibility checks, legacy failure recording, pre-acknowledged start, direct close, and endpoint imports. Map pause/duck to `pause`, end/stale/rehydration cleanup to `end`, and explicit force to `manual` after local commit.

- [ ] **Step 5: Verify service regression and circular boundary**

```bash
npx jest --runTestsByPath src/services/__tests__/ProgressService.hotpath.test.ts src/services/__tests__/ProgressService.rehydration.test.ts --runInBand
npx dpdm --circular src/services/ProgressService.ts
npx dpdm --circular src/services/ProgressSyncWorker.ts
```

Expected: focused tests PASS and no new cycle rooted at either service.

- [ ] **Step 6: Commit**

```bash
git add src/services/ProgressService.ts src/services/__tests__/ProgressService.hotpath.test.ts src/services/__tests__/ProgressService.rehydration.test.ts
git commit -m "refactor: route progress delivery through outbox worker"
```

### Task 7: Bind auth, foreground, network, background playback, and wipe lifecycles

**Files:**

- Modify: `src/providers/AuthProvider.tsx`
- Modify: `src/providers/__tests__/AuthProvider.test.tsx`
- Modify: `src/services/PlayerBackgroundService.ts`
- Modify: `src/services/__tests__/PlayerBackgroundServiceFade.test.ts`
- Modify: `src/app/_layout.tsx`
- Modify: `src/providers/StoreProvider.tsx` or create `src/providers/ProgressSyncProvider.tsx`
- Modify/Create: provider lifecycle tests beside the chosen provider
- Modify: `src/stores/slices/networkSlice.ts` only if exposing a read-only recovery signal without importing the worker

**Interfaces:**

- Consumes: `progressSyncWorker.start/stop/requestDrain` and existing `fetchServerProgress()` for server-to-local refresh.
- Produces: one UI-context lifecycle owner that runs outbound drain first, then server refresh, only while authenticated.

- [ ] **Step 1: Add failing lifecycle and race tests**

Assert worker start receives the confirmed login-response user ID; first login with no retained user, same-user reauth, and different-account login never start with null/stale IDs. Assert terminal token expiry, explicit logout, server switch, and provider teardown stop the worker. Assert foreground and disconnected-to-connected transitions request drains only while authenticated, outbound drain precedes refresh, and root layout no longer has an ungated progress refresh.

- [ ] **Step 2: Add failing background-playback tests**

Remove assertions around `shouldSyncToServer()` and assert `PlayerBackgroundService` performs only local `updateProgress()`/end calls. Its headless JS context must not start a worker or issue endpoints.

- [ ] **Step 3: Verify the red state**

```bash
npx jest --runTestsByPath src/providers/__tests__/AuthProvider.test.tsx src/services/__tests__/PlayerBackgroundServiceFade.test.ts --runInBand
```

Expected: FAIL on old `ProgressService` lifecycle, adaptive sync, and identity race.

- [ ] **Step 4: Make authenticated identity atomic**

Introduce an explicit login-in-progress/confirmed-identity gate so token subscription callbacks cannot expose `authenticated` with a retained old `userId`. Persist/upsert the response user before marking the identity confirmed; only then may the lifecycle owner call `start(confirmedUserId)`. Initialization may confirm the stored username/user row and existing token together. Await `wipeUserData()` during logout/server switch before allowing a new authenticated worker start.

- [ ] **Step 5: Consolidate foreground and network recovery**

Use a provider below `AuthProvider` to observe auth, `AppState`, and network recovery without creating a service↔store cycle. On authenticated foreground/recovery: `requestDrain("foreground" | "network")`, await/test `drainNow()` where ordering is required, then call server-to-local refresh. Remove the unconditional root-layout progress refreshes.

- [ ] **Step 6: Remove background adaptive delivery**

Delete the 15s/60s `shouldSyncToServer()` and `syncSessionToServer()` branch from `PlayerBackgroundService`; the worker now owns cadence. Keep progress ticks and local end/error persistence unchanged.

- [ ] **Step 7: Verify and commit**

Run focused provider/background/network suites and both `dpdm` commands from Task 6, then:

```bash
git add src/providers src/services/PlayerBackgroundService.ts src/services/__tests__/PlayerBackgroundServiceFade.test.ts src/app/_layout.tsx src/stores/slices/networkSlice.ts
git commit -m "feat: bind progress worker to authenticated lifecycle"
```

### Task 8: Prove restart/reauth losslessness, diagnostics, and rollout gates

**Files:**

- Create: `src/services/__tests__/ProgressSyncRecovery.integration.test.ts`
- Modify: `docs/BACKLOG.md` with the SQLite foreign-key audit follow-up
- Modify: `docs/plans/stale-token-progress-sync.md` only when implementation changes alter the maintained architecture
- Modify: diagnostic export code only if existing trace export does not already include the new table

**Interfaces:**

- Consumes: the complete feature.
- Produces: a deterministic integration proof and a backlog entry covering all declared cascades, especially `local_progress_snapshots`.

- [ ] **Step 1: Write the end-to-end recovery test**

With real database helpers and a fake endpoint, execute:

1. start and successfully sync a session;
2. stop the worker to model `reauthRequired`;
3. advance and end locally;
4. construct a fresh worker to model restart;
5. start with the retained user and verify immediate same-UUID upload;
6. advance again while that upload is deferred;
7. resolve it and verify a second upload acknowledges the newer revision;
8. explicitly log out and prove session/outbox deletion.

Assert no request is made while stopped, no additive endpoint is used, and the final desired/acknowledged revisions match.

- [ ] **Step 2: Add the foreign-key audit backlog entry**

The backlog entry must inventory declared constraints, detect accumulated violations before enabling the pragma, cover production and test DB parity, and explicitly include the inert `local_progress_snapshots.session_id` cascade. Do not enable the pragma here.

- [ ] **Step 3: Run focused feature verification**

```bash
npx jest --runTestsByPath \
  src/db/helpers/__tests__/progressSyncOutboxMigration.test.ts \
  src/db/helpers/__tests__/progressSyncOutbox.test.ts \
  src/db/helpers/__tests__/localListeningSessions.test.ts \
  src/db/helpers/__tests__/wipeUserData.test.ts \
  src/lib/api/__tests__/progressSessionEndpoints.test.ts \
  src/services/__tests__/ProgressSyncWorker.lifecycle.test.ts \
  src/services/__tests__/ProgressSyncWorker.delivery.test.ts \
  src/services/__tests__/ProgressService.hotpath.test.ts \
  src/services/__tests__/ProgressService.rehydration.test.ts \
  src/services/__tests__/ProgressSyncRecovery.integration.test.ts \
  src/providers/__tests__/AuthProvider.test.tsx \
  --runInBand
```

Expected: all focused suites PASS with no leaked worker timers.

- [ ] **Step 4: Run repository and static gates**

```bash
npm test -- --runInBand
npx eslint <all-changed-ts-and-tsx-files>
npx tsc --noEmit --pretty false
npx dpdm --circular src/services/ProgressService.ts
npx dpdm --circular src/services/ProgressSyncWorker.ts
git diff --check
```

Expected: full Jest PASS; changed-file ESLint has zero errors; changed-file TypeScript diagnostics are empty if repository-wide `tsc` retains unrelated baseline errors; no new service cycle; diff check clean.

- [ ] **Step 5: Inspect hot-path and network invariants**

Use the hot-path test spies plus `rg`:

```bash
rg -n "syncSession\(|/api/session/.*/sync|syncSessionToServer|markSessionAsSynced|getUnsyncedSessions" src/services src/providers src/app src/stores
rg -n "db\.(insert|update|delete)" src/services/ProgressSyncWorker.ts src/services/ProgressService.ts
```

Expected: worker has no additive sync path; obsolete queue/direct-sync calls have no progress-delivery callers; services contain no inline Drizzle writes; one tick performs one atomic helper transaction and no synchronous UI-thread work.

- [ ] **Step 6: Commit integration proof and follow-up**

```bash
git add src/services/__tests__/ProgressSyncRecovery.integration.test.ts docs/BACKLOG.md
git commit -m "test: prove stale-token progress recovery"
```

## Execution Notes

- Baseline in the isolated worktree: 68/68 suites passed, 1,127 tests passed, 3 skipped on 2026-07-20. Existing console warnings and Jest's force-exit/open-handle warning are baseline noise, but new worker tests must prove their own timers are cleaned up.
- Task dependencies are intentionally sequential: migration → helpers → endpoint contract → worker lifecycle → worker delivery → service integration → app integration → end-to-end verification.
- Each implementer must use TDD, commit only its owned task files, and write a task report. Each task receives a fresh spec-and-quality review before the next task starts.
- Durable design changes discovered during implementation are reflected in `docs/plans/stale-token-progress-sync.md`.
