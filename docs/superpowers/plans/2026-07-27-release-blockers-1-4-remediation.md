# Release Blockers 1-4 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the four confirmed release blockers involving bookmark identity, logout cleanup, diagnostic privacy, and `FloatingPlayer` Hook ordering.

**Architecture:** Bookmark persistence will require a durable local user identity, while a small auth-owned provider will trigger queued delivery only for the currently authenticated identity. Logout will explicitly delete every durable progress child row without relying on SQLite foreign keys. Diagnostic persistence will become manual, sanitized, and bounded by both age and count; the mini-player fix will preserve identical Hook order across every render.

**Tech Stack:** React Native, Expo, TypeScript, Zustand, Drizzle ORM with SQLite, Jest, React Native Testing Library, ESLint.

## Global Constraints

- Work only in `/Users/clay/Code/github/SideShelf/.worktrees/release-blockers-1-4` on branch `codex/release-blockers-1-4`; do not modify the source checkout or its uncommitted Home-shelf work.
- Follow test-driven development: add the regression test, run it and record the expected failure, implement the smallest fix, then rerun the focused tests.
- All database access remains in `src/db/helpers/`; do not add inline Drizzle queries to providers, stores, services, or UI.
- Services and providers may import only specific DB helper files, never the `@/db/helpers` barrel.
- Use the tagged logger for new runtime logging; do not add `console.*`.
- Do not introduce dependencies, migrations, OTA changes, SDK-alignment changes, or unrelated refactors.
- Preserve offline playback and local data while credentials are in `reauthRequired`; only explicit logout, account change, or server change wipes user data.
- Each task ends in its own focused commit and must pass scoped ESLint, its focused Jest tests, and `git diff --check`.

---

### Task 1: Make bookmark persistence identity-safe and auth-owned

**Files:**

- Create: `src/providers/BookmarkSyncProvider.tsx`
- Create: `src/providers/__tests__/BookmarkSyncProvider.test.tsx`
- Modify: `src/providers/StoreProvider.tsx`
- Modify: `src/stores/slices/userProfileSlice.ts`
- Modify: `src/stores/slices/__tests__/userProfileSlice.test.ts`
- Modify: `src/stores/slices/networkSlice.ts`
- Delete: `src/stores/slices/__tests__/networkSlice.test.ts`

**Interfaces:**

- Consumes: `useAuth()` with `authStatus` and `userId`; `useNetwork()` with `initialized`, `isConnected`, and `isInternetReachable`; `useAppStore` selectors for `userProfile.activeUserId` and `drainPendingBookmarkOps`.
- Produces: `BookmarkSyncProvider({ children })`, mounted by `StoreProvider`; bookmark actions that throw before API or database work when `activeUserId` is absent; local initialization that retains `activeUserId` when `fetchMe()` is unavailable.

- [ ] **Step 1: Add failing local-identity and mutation-guard tests**

  Extend `userProfileSlice.test.ts` with tests that:

  ```typescript
  endpoints.fetchMe.mockRejectedValueOnce(new Error("offline"));
  await expect(store.getState().initializeUserProfile("testuser")).resolves.toBeUndefined();
  expect(store.getState().userProfile).toMatchObject({
    activeUserId: "user-1",
    initialized: true,
    isLoading: false,
  });
  ```

  Also add one test for each of `createBookmark`, `deleteBookmark`, and `renameBookmark` starting from `activeUserId: null`. Each must reject with an error containing `active user`, and the test must prove that its API functions and `upsertBookmark`, `deleteBookmarkLocal`, and `enqueuePendingOp` were not called.

- [ ] **Step 2: Run the slice tests and verify the new tests fail for the diagnosed reasons**

  Run:

  ```bash
  npm test -- --runInBand src/stores/slices/__tests__/userProfileSlice.test.ts
  ```

  Expected: the offline initializer rejects or leaves `activeUserId` unset, and bookmark mutations reach API/database mocks without a valid identity.

- [ ] **Step 3: Initialize the durable local identity before remote bookmark refresh**

  Refactor `initializeUserProfile` so it first awaits `getDeviceInfo()` and `getUserByUsername(username)`. If the local user has an ID, commit `deviceInfo`, `user`, `activeUserId`, `initialized: true`, and `isLoading: false` before attempting `fetchMe()`. A later `fetchMe()` failure must log a warning and retain that initialized local identity instead of resetting or throwing.

  If no local user exists, use a successful `fetchMe()` response as the only fallback source of `activeUserId`; if neither local nor remote identity can be established, leave `initialized: false`, clear `isLoading`, and reject rather than inventing an identity.

  On successful `fetchMe()`, continue normalizing the server bookmarks, call `upsertAllBookmarks(activeUserId, bookmarks)`, and update the in-memory bookmarks without replacing the already established local identity.

- [ ] **Step 4: Reject every bookmark mutation without a non-empty active user**

  Add one private module-level helper:

  ```typescript
  function requireActiveUserId(state: UserProfileSlice, operation: string): string {
    const userId = state.userProfile.activeUserId?.trim();
    if (!userId) {
      throw new Error(`[${operation}] Cannot persist bookmark without an active user`);
    }
    return userId;
  }
  ```

  Call it before any state mutation, API call, database write, or queue write in `createBookmark`, `deleteBookmark`, and `renameBookmark`. Remove every `activeUserId ?? ""` fallback. Keep `drainPendingBookmarkOps` as a no-op when no identity exists, because lifecycle triggers may race harmlessly with initialization.

- [ ] **Step 5: Verify the slice is green**

  Run:

  ```bash
  npm test -- --runInBand src/stores/slices/__tests__/userProfileSlice.test.ts
  ```

  Expected: all tests pass, including offline initialization and the three mutation guards.

- [ ] **Step 6: Add failing authenticated-lifecycle tests**

  Create `BookmarkSyncProvider.test.tsx` with mutable mocked auth, network, active-user, and drain state. Prove:

  ```typescript
  // No delivery while signed out or reauthRequired.
  expect(mockDrainPendingBookmarkOps).not.toHaveBeenCalled();

  // Delivery starts only when auth user and local active user are the same.
  auth = { authStatus: "authenticated", userId: "user-1" };
  activeUserId = "user-1";
  view.rerender(<BookmarkSyncProvider />);
  expect(mockDrainPendingBookmarkOps).toHaveBeenCalledTimes(1);

  // A reauthRequired -> authenticated transition triggers a new attempt.
  // A disconnected -> connected transition triggers a new attempt.
  // A mismatched activeUserId never triggers delivery.
  ```

  Use `act()` to flush the provider effect and mock drain rejection to confirm failures are caught and logged rather than becoming unhandled promises.

- [ ] **Step 7: Run the provider test and verify it fails because the provider does not exist**

  Run:

  ```bash
  npm test -- --runInBand src/providers/__tests__/BookmarkSyncProvider.test.tsx
  ```

  Expected: failure resolving `BookmarkSyncProvider`.

- [ ] **Step 8: Move bookmark delivery ownership out of the network slice**

  Create `BookmarkSyncProvider.tsx`. It must select `activeUserId` and `drainPendingBookmarkOps` individually from `useAppStore`, read auth and network state from their existing hooks, and invoke the drain only when all of these are true:

  ```typescript
  authStatus === "authenticated";
  userId !== null;
  activeUserId === userId;
  networkInitialized;
  isConnected;
  isInternetReachable !== false;
  ```

  The effect must catch and log a failed drain. Mount it inside `StoreProvider` alongside `ProgressSyncProvider`.

  Remove the `drainPendingBookmarkOps` call and `any` cast from `networkSlice`; reachability remains the network slice's only responsibility. Delete the obsolete network-slice test file, whose only contract was the removed cross-slice drain.

- [ ] **Step 9: Verify Task 1**

  Run:

  ```bash
  npm test -- --runInBand src/stores/slices/__tests__/userProfileSlice.test.ts src/providers/__tests__/BookmarkSyncProvider.test.tsx
  npx eslint src/stores/slices/userProfileSlice.ts src/stores/slices/__tests__/userProfileSlice.test.ts src/stores/slices/networkSlice.ts src/providers/BookmarkSyncProvider.tsx src/providers/__tests__/BookmarkSyncProvider.test.tsx src/providers/StoreProvider.tsx
  git diff --check
  ```

  Expected: zero Jest failures, zero ESLint errors, and no whitespace errors.

- [ ] **Step 10: Commit Task 1**

  ```bash
  git add src/providers/BookmarkSyncProvider.tsx src/providers/__tests__/BookmarkSyncProvider.test.tsx src/providers/StoreProvider.tsx src/stores/slices/userProfileSlice.ts src/stores/slices/__tests__/userProfileSlice.test.ts src/stores/slices/networkSlice.ts src/stores/slices/__tests__/networkSlice.test.ts
  git commit -m "fix: bind bookmark sync to authenticated identity"
  ```

---

### Task 2: Explicitly delete local progress snapshots on logout

**Files:**

- Modify: `src/db/helpers/wipeUserData.ts`
- Modify: `src/db/helpers/__tests__/wipeUserData.test.ts`

**Interfaces:**

- Consumes: `localProgressSnapshots` and `localListeningSessions` from `src/db/schema/localData.ts`.
- Produces: `wipeUserData()` that deletes snapshots before listening sessions even when `PRAGMA foreign_keys = OFF`.

- [ ] **Step 1: Add the failing foreign-keys-off regression**

  Update the existing wipe test to capture the returned session ID, insert a snapshot, disable foreign keys, call `wipeUserData()`, and assert all three progress tables are empty:

  ```typescript
  const sessionId = await startListeningSession("user-1", "item-1", "media-1", 0, 3600);
  await testDb.db.insert(localProgressSnapshots).values({
    id: "snapshot-1",
    sessionId,
    currentTime: 30,
    progress: 30 / 3600,
    playbackRate: 1,
    volume: 1,
    chapterId: null,
    isPlaying: true,
    timestamp: new Date(),
  });
  testDb.sqlite.execSync("PRAGMA foreign_keys = OFF");
  await wipeUserData();
  expect(await testDb.db.select().from(localProgressSnapshots)).toEqual([]);
  ```

- [ ] **Step 2: Run the test and verify the orphan remains**

  Run:

  ```bash
  npm test -- --runInBand src/db/helpers/__tests__/wipeUserData.test.ts
  ```

  Expected: failure because `local_progress_snapshots` still contains `snapshot-1`.

- [ ] **Step 3: Delete snapshots before sessions**

  Import `localProgressSnapshots` from the specific schema file and add:

  ```typescript
  await db.delete(progressSyncOutbox);
  await db.delete(localProgressSnapshots);
  await db.delete(localListeningSessions);
  ```

  Update the file-level documentation to list snapshots among the explicitly wiped user data.

- [ ] **Step 4: Verify and commit Task 2**

  Run:

  ```bash
  npm test -- --runInBand src/db/helpers/__tests__/wipeUserData.test.ts
  npx eslint src/db/helpers/wipeUserData.ts src/db/helpers/__tests__/wipeUserData.test.ts
  git diff --check
  git add src/db/helpers/wipeUserData.ts src/db/helpers/__tests__/wipeUserData.test.ts
  git commit -m "fix: remove progress snapshots during logout"
  ```

  Expected: the regression passes with foreign keys disabled and all static checks succeed.

---

### Task 3: Make persisted diagnostics manual, redacted, and bounded

**Files:**

- Modify: `src/lib/trace.ts`
- Modify: `src/lib/__tests__/trace.test.ts`
- Modify: `src/lib/traceDump.ts`
- Modify: `src/lib/__tests__/traceDump.test.ts`
- Modify: `src/lib/api/endpoints.ts`
- Modify: `src/lib/api/__tests__/progressSessionEndpoints.test.ts`
- Modify: `src/services/coordinator/PlayerStateCoordinator.ts`
- Modify: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`

**Interfaces:**

- Consumes: existing `LocalTrace`, manual `writeDumpToDisk("manual")`, and progress-sync diagnostic rows.
- Produces: exported `sanitizeTracePayload(value: unknown): unknown`; trace dumps containing no user, item, media, episode, session, or device identifiers; pruning that deletes expired dumps and count overflow; rejected transitions that remain in memory/logs but never auto-write a file.

- [ ] **Step 1: Add failing sanitizer and dump-payload tests**

  Add a `trace.test.ts` case that records nested attributes containing `userId`, `libraryId`, `libraryItemId`, `itemId`, `mediaId`, `episodeId`, `sessionId`, `restoreSessionId`, and `deviceId`. Exported attributes must replace each value with `"[REDACTED]"` while preserving `traceId`, `spanId`, event names, state names, counters, and timing.

  Update `traceDump.test.ts` so the persisted JSON must not contain the mocked `"session-1"` progress diagnostic ID. It must contain `"[REDACTED]"`.

- [ ] **Step 2: Add failing retention, endpoint-log, and coordinator tests**

  Change the old retention assertion so a 10-day-old trace dump must be deleted. Preserve the existing count test that keeps only the newest 30 recent dumps.

  In `progressSessionEndpoints.test.ts`, inspect the `api:endpoints` tagged logger after `createLocalSession(sessionParams)` and assert that no info message contains the session ID, user ID, library ID, library-item ID, device ID, or serialized request body.

  In `PlayerStateCoordinator.test.ts`, import the mocked `writeDumpToDisk`, dispatch an event that increments `rejectedTransitionCount`, and assert the mock was not called.

- [ ] **Step 3: Run the four focused suites and verify all new assertions fail**

  Run:

  ```bash
  npm test -- --runInBand src/lib/__tests__/trace.test.ts src/lib/__tests__/traceDump.test.ts src/lib/api/__tests__/progressSessionEndpoints.test.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
  ```

  Expected: failures show unredacted identifiers, retained expired dumps, the full session log, and automatic rejection dumps.

- [ ] **Step 4: Centralize diagnostic sanitization**

  Extend `DEFAULT_CONFIG.redactKeys` in `trace.ts` with case-insensitive identity keys covering:

  ```typescript
  ("userId", "libraryId", "itemId", "mediaId", "episodeId", "sessionId", "deviceId");
  ```

  The existing substring matching intentionally covers compound keys such as `libraryItemId`, `mediaItemId`, and `restoreSessionId`. Do not add the generic key `"id"` because `traceId` and `spanId` are required for diagnostics.

  Export:

  ```typescript
  export function sanitizeTracePayload(value: unknown): unknown {
    return sanitizeValue(value, DEFAULT_CONFIG, 0);
  }
  ```

  Serialize `sanitizeTracePayload(payload)` in `writeDumpToDisk` so raw rejection metadata and progress-sync diagnostics pass through the same policy as trace attributes.

- [ ] **Step 5: Correct retention semantics**

  In `pruneTraceDumps`, parse every matching dump with a valid timestamp. Delete all entries older than seven days. Sort only the remaining entries newest-first and delete every entry beyond the newest 30. Leave non-dump files and malformed dump filenames untouched. Log the actual kept and deleted counts.

- [ ] **Step 6: Stop automatic file persistence and remove the session request body log**

  Remove the `writeDumpToDisk` import and fire-and-forget call from the rejected-transition path. Keep the in-memory trace event, ended error span, warning log, and rejected-transition metric. Manual dumps from the floating player remain available.

  Replace the `createLocalSession` info message with a constant message such as:

  ```typescript
  log.info("Creating local listening session");
  ```

  Keep `bodyText` solely as the HTTP request body; do not log IDs or serialized session data.

- [ ] **Step 7: Verify Task 3**

  Run:

  ```bash
  npm test -- --runInBand src/lib/__tests__/trace.test.ts src/lib/__tests__/traceDump.test.ts src/lib/api/__tests__/progressSessionEndpoints.test.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
  npx eslint src/lib/trace.ts src/lib/__tests__/trace.test.ts src/lib/traceDump.ts src/lib/__tests__/traceDump.test.ts src/lib/api/endpoints.ts src/lib/api/__tests__/progressSessionEndpoints.test.ts src/services/coordinator/PlayerStateCoordinator.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
  git diff --check
  ```

  Expected: all focused tests pass, persisted JSON contains no listed identifiers, expired files are deleted, coordinator rejection writes no dump, and static checks succeed.

- [ ] **Step 8: Commit Task 3**

  ```bash
  git add src/lib/trace.ts src/lib/__tests__/trace.test.ts src/lib/traceDump.ts src/lib/__tests__/traceDump.test.ts src/lib/api/endpoints.ts src/lib/api/__tests__/progressSessionEndpoints.test.ts src/services/coordinator/PlayerStateCoordinator.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
  git commit -m "fix: bound and redact persisted diagnostics"
  ```

---

### Task 4: Keep `FloatingPlayer` Hook order stable

**Files:**

- Create: `src/components/ui/__tests__/FloatingPlayer.test.tsx`
- Modify: `src/components/ui/FloatingPlayer.tsx`

**Interfaces:**

- Consumes: existing player, settings, theme, path, and search-parameter hooks.
- Produces: unchanged UI behavior with `useCallback` invoked on every render before any conditional return.

- [ ] **Step 1: Add a failing render-transition regression**

  Create a focused React Native Testing Library test with mutable `usePlayer()` mock state. Render with `currentTrack: null`, change the mock to a minimal valid track, and rerender the same `FloatingPlayer` instance:

  ```typescript
  const view = render(<FloatingPlayer />);
  expect(view.queryByTestId("floating-player")).toBeNull();

  playerState = {
    ...playerState,
    currentTrack: {
      id: "track-1",
      libraryItemId: "item-1",
      title: "Book",
      duration: 3600,
      coverUri: "",
    },
  };

  expect(() => view.rerender(<FloatingPlayer />)).not.toThrow();
  expect(view.getByTestId("floating-player")).toBeTruthy();
  ```

  Mock child components and native/router dependencies only as needed to isolate Hook order. The pre-fix render must fail with React's rendered-more-hooks error.

- [ ] **Step 2: Run the test and verify the Hook-order failure**

  Run:

  ```bash
  npm test -- --runInBand src/components/ui/__tests__/FloatingPlayer.test.tsx
  ```

  Expected: rerender throws because `useCallback` appears only after the early-return paths.

- [ ] **Step 3: Move the callback above every conditional return**

  Keep the existing callback body and empty dependency array, but declare `handlePlayPauseLongPress` immediately after the unconditional hooks and before `if (!currentTrack) return null`. Do not change navigation, playback, haptics, layout, or visibility behavior.

- [ ] **Step 4: Verify and commit Task 4**

  Run:

  ```bash
  npm test -- --runInBand src/components/ui/__tests__/FloatingPlayer.test.tsx
  npx eslint src/components/ui/FloatingPlayer.tsx src/components/ui/__tests__/FloatingPlayer.test.tsx
  git diff --check
  git add src/components/ui/FloatingPlayer.tsx src/components/ui/__tests__/FloatingPlayer.test.tsx
  git commit -m "fix: keep floating player hooks unconditional"
  ```

  Expected: the null-to-track rerender succeeds and the focused static checks pass.

---

### Task 5: Commit the verified Home downloaded-shelf filter

**Files:**

- Modify: `src/stores/slices/homeSlice.ts`
- Create: `src/stores/slices/__tests__/homeSlice.test.ts`

**Interfaces:**

- Consumes: `downloadService.isLibraryItemDownloaded(libraryItemId)` as the canonical full-download predicate and the existing `HomeScreenItem[]` candidate lists from `src/db/helpers/homeScreen.ts`.
- Produces: Home `downloaded` shelves that retain candidate ordering but exclude partial, missing, or otherwise incomplete local downloads during initialization, whole-home refresh, and downloaded-section refresh.

- [ ] **Step 1: Migrate the source-checkout regression test before production code**

  Copy only the approved Home-shelf test intent from `/Users/clay/Code/github/SideShelf/src/stores/slices/__tests__/homeSlice.test.ts`. Mock the four home-screen DB helpers and the singleton `downloadService.isLibraryItemDownloaded`.

  Cover all three changed entry points:

  ```typescript
  initializeHome("user-1");
  refreshHome("user-1");
  refreshSection("downloaded", "user-1");
  ```

  For each path, return candidates in the order `complete-book`, `partial-book`, make the canonical predicate resolve `true` only for `complete-book`, and assert the final downloaded shelf is exactly:

  ```typescript
  [{ id: "complete-book", title: "Complete" }];
  ```

- [ ] **Step 2: Run the test and verify the shelf still includes the partial candidate**

  Run:

  ```bash
  npm test -- --runInBand src/stores/slices/__tests__/homeSlice.test.ts
  ```

  Expected: the new assertions fail because the baseline slice assigns database candidates directly without consulting the canonical download predicate.

- [ ] **Step 3: Migrate the approved Home-shelf implementation**

  Import `downloadService` directly from `@/services/DownloadService` and add:

  ```typescript
  async function getFullyDownloadedItems(items: HomeScreenItem[]): Promise<HomeScreenItem[]> {
    const verifiedItems = await Promise.all(
      items.map(async (item) =>
        (await downloadService.isLibraryItemDownloaded(item.id)) ? item : null
      )
    );
    return verifiedItems.filter((item): item is HomeScreenItem => item !== null);
  }
  ```

  Apply it to `data.downloaded` in both `initializeHome` and `refreshHome`, and to `await getDownloadedItems()` in the `"downloaded"` `refreshSection` branch. Use the verified count in the initialization log. Keep candidate order stable and leave the continue-listening and listen-again shelves unchanged.

- [ ] **Step 4: Verify Home-shelf behavior and dependency safety**

  Run:

  ```bash
  npm test -- --runInBand src/stores/slices/__tests__/homeSlice.test.ts
  npx eslint src/stores/slices/homeSlice.ts src/stores/slices/__tests__/homeSlice.test.ts
  npx dpdm --circular src/stores/slices/homeSlice.ts
  git diff --check
  ```

  Expected: all Home tests pass, ESLint has zero errors, no circular dependency is found, and the diff is whitespace-clean.

- [ ] **Step 5: Commit only the Home-shelf files**

  ```bash
  git add src/stores/slices/homeSlice.ts src/stores/slices/__tests__/homeSlice.test.ts
  git commit -m "fix: verify complete downloads on home shelf"
  ```

  Do not stage or alter `/Users/clay/Code/github/SideShelf/CLAUDE.md` or `/Users/clay/Code/github/SideShelf/src/components/ui/__tests__/CoverImage.test.tsx`; those remain user-owned source-checkout changes.

---

## Final Integration Verification

- [ ] Run the complete Jest suite:

  ```bash
  npm test -- --runInBand --silent
  ```

- [ ] Run dependency-cycle, branch-scoped lint, and whitespace checks:

  ```bash
  npm run check:circular
  npx eslint src/providers/BookmarkSyncProvider.tsx src/providers/__tests__/BookmarkSyncProvider.test.tsx src/providers/StoreProvider.tsx src/stores/slices/userProfileSlice.ts src/stores/slices/__tests__/userProfileSlice.test.ts src/stores/slices/networkSlice.ts src/db/helpers/wipeUserData.ts src/db/helpers/__tests__/wipeUserData.test.ts src/lib/trace.ts src/lib/__tests__/trace.test.ts src/lib/traceDump.ts src/lib/__tests__/traceDump.test.ts src/lib/api/endpoints.ts src/lib/api/__tests__/progressSessionEndpoints.test.ts src/services/coordinator/PlayerStateCoordinator.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts src/components/ui/FloatingPlayer.tsx src/components/ui/__tests__/FloatingPlayer.test.tsx
  git diff --check f324ad82cc66476cb8e4380a4627171fca44fffc..HEAD
  ```

- [ ] Confirm the source checkout remains unchanged:

  ```bash
  git -C /Users/clay/Code/github/SideShelf status --short
  ```

- [ ] Request a whole-branch review against `f324ad82cc66476cb8e4380a4627171fca44fffc`, remediate any Critical or Important findings through one reviewed fix wave, and return the worktree branch for user verification without merging or pushing.
