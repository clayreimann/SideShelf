# Stale-Token Progress Sync Test Plan

## Purpose

Verify that listening progress remains lossless across token expiry, temporary server failures,
offline playback, process restarts, reauthentication, and account/server changes. The main risk is
not a visible crash: it is silently losing, duplicating, or applying progress to the wrong identity.

## Test Setup

- Use a physical iOS device when possible; repeat the PR smoke pass on an iOS simulator.
- Prepare one downloaded audiobook and one downloaded podcast with at least two episodes.
- Prepare two Audiobookshelf accounts (`Account A` and `Account B`).
- Record the server-side position before and after each scenario.
- Keep a way to disable networking and, for the extended pass, return controlled 401, 403, and 503
  responses from the session and token-refresh endpoints.
- Export a trace dump after any failure before relaunching or signing out.

Position comparisons should allow up to two seconds for player event timing. Listening time must not
be doubled, and progress must never move backward unless the server-to-local force-resync action is
explicitly used.

## PR Smoke Pass

Run these scenarios before merging or updating the PR build.

### 1. Normal online audiobook sync

1. Sign in as Account A on Wi-Fi.
2. Start the downloaded audiobook, listen for at least 30 seconds, pause, and background the app.
3. Confirm the server position advances once to approximately the device position.
4. Resume, listen another 15 seconds, force-quit, and relaunch.

Pass: playback resumes near the latest position and the server converges to the final absolute
position without duplicate listening time.

### 2. Expiry while listening, followed by same-account reauthentication

1. Start the downloaded audiobook and listen for at least 15 seconds.
2. Invalidate Account A's access and refresh credentials, then trigger an authenticated request.
3. Confirm the app enters the reauthentication-required state without blocking downloaded playback.
4. Continue listening, pause, force-quit, and relaunch while still signed out from the server.
5. Confirm the local resume position is retained and no progress request is made before sign-in.
6. Reauthenticate as Account A.

Pass: pending progress uploads immediately after reauthentication, the server reaches the latest
local position, and no listen interval is lost or counted twice.

### 3. Offline playback and network recovery

1. Start downloaded playback while online, then enable airplane mode.
2. Listen for at least 30 seconds, pause, resume, and end playback.
3. Background and foreground the app while offline.
4. Disable airplane mode and foreground the app.

Pass: playback and local resume continue offline; no network request is attempted while unavailable;
after recovery, outbound progress drains before the inbound server refresh and the final server
position matches the device.

### 4. Logout and account isolation

1. As Account A, create pending progress while offline.
2. Explicitly log out before reconnecting.
3. Sign in as Account B and reconnect.

Pass: Account A's pending session/outbox data is removed, nothing from Account A uploads under
Account B, and Account B's server progress remains unchanged.

### 5. Podcast episode identity

1. Play episode 1 of the downloaded podcast and sync progress.
2. Play episode 2 and sync a different position.
3. Relaunch and inspect both episodes on the server.

Pass: each update is attached to the correct episode; one episode never overwrites or reconciles the
other.

## Extended Release Pass

### 6. Temporary refresh outage is not terminal

1. Let a resource request return 401.
2. Make `/auth/refresh` fail with 503; repeat with a network-level failure.
3. Restore the server/network.

Pass: credentials and offline identity remain intact, the app does not force reauthentication, the
failed progress attempt backs off, and a later retry succeeds. Repeat with refresh 401/403 and confirm
that only those definitive responses enter reauthentication-required.

### 7. Restart during persisted backoff

1. Make the progress upload return 503 and note the retry deadline in diagnostics.
2. Force-quit before the deadline and relaunch while authenticated.
3. Keep the app alive through the deadline.

Pass: no early request occurs, and the pending session retries at the persisted deadline rather than
waiting for the two-minute periodic sweep.

### 8. In-flight N/N+1 update

1. Delay an outbound progress request after it begins.
2. Continue playback long enough to commit newer local progress while the request is in flight.
3. Release the first request.

Pass: the first response acknowledges only its captured revision, a second absolute update follows,
and the server finishes at the newer position without additive overcounting.

### 9. Credential race during account or server change

1. Delay a token-refresh response and secure-credential persistence.
2. While delayed, log out, sign in as Account B, or switch servers.
3. Release the old refresh operation.

Pass: the old response cannot clear or overwrite the newer credentials, no old-account request is
sent, and relaunch restores the newest account/server credentials.

### 10. Force server resync

1. Set the server position ahead of the device position.
2. Use the item's force-resync action while authenticated.
3. Repeat while in reauthentication-required state.

Pass: the authenticated action updates local media/session position without dirtying or uploading the
outbox. The unauthenticated action makes no progress request and cannot repopulate wiped data.

### 11. Migration upgrade

1. On a build from before this change, create one active local session, one ended unsynced session,
   and one previously synced session if practical.
2. Install the new build over the existing app data.
3. Launch, resume playback, and reconnect.

Pass: migrations complete without data loss; active and unsynced work is delivered; already-clean
history is not redundantly uploaded; path normalization still completes.

### 12. Diagnostics and privacy

1. Create more than one pending/retrying session and export a trace dump.
2. Inspect the progress outbox section.
3. Simulate a diagnostic query failure and export again.

Pass: the dump contains only bounded outbox metadata, exposes no user/media/episode identifiers or
raw server errors, and reports outbox availability without preventing the dump from being written.

## Automated Regression Gate

```bash
npm test -- --runInBand
npx jest --runTestsByPath \
  src/services/__tests__/ProgressSyncRecovery.integration.test.ts \
  src/services/__tests__/ProgressSyncWorker.lifecycle.test.ts \
  src/services/__tests__/ProgressSyncWorker.delivery.test.ts \
  src/services/__tests__/ApiClientService.test.ts \
  src/lib/api/__tests__/api.test.ts \
  src/services/__tests__/ServerProgressRefreshService.test.ts \
  src/providers/__tests__/AuthProvider.test.tsx \
  src/services/__tests__/ProgressService.hotpath.test.ts \
  --runInBand
```

Also run branch-scoped ESLint, Prettier, `git diff --check`, and circular-dependency checks for
`ProgressService`, `ProgressSyncWorker`, and `ServerProgressRefreshService`. Repository-wide lint and
TypeScript currently contain unrelated baseline failures, so report those separately from diagnostics
introduced by this change.

## Release Acceptance

- Downloaded playback remains usable during token expiry and offline periods.
- No progress network work occurs without authenticated credentials.
- Local progress survives pause, end, force-quit, restart, and reauthentication.
- Server progress converges to the latest absolute local revision without duplication.
- Transient refresh/server failures do not force logout; definitive rejection does.
- Account and server switches cannot upload, restore, or persist another identity's data.
- Audiobook and podcast episode progress reconcile to the correct server record.
- Trace exports remain bounded and redact identifiers, payloads, tokens, and raw errors.
