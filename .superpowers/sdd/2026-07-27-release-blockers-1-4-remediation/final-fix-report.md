# Final Review Fix Report

## Status

Complete. All three Important final-review findings and the stable-provider-test-wrapper Minor
were remediated in the assigned worktree. The coordinator-test Minor was intentionally left
unchanged, as requested. Nothing was pushed or merged.

## Root causes

### Bookmark auth-generation race

`BookmarkSyncProvider` checked authentication and local identity only before starting
`drainPendingBookmarkOps()`. The slice then captured `activeUserId` and continued across awaited
API calls without a current-authentication fence. A logout, same-user reauthentication, account
change, or server change could therefore allow the old generation to upsert a remote response,
clear durable pending rows, or refresh in-memory bookmarks.

### Overlapping bookmark drains

Every eligible provider effect invoked an independent drain. The slice had no central in-flight
worker state, so two triggers could dequeue the same FIFO rows and replay the same remote
operation concurrently.

The provider test also returned a new wrapper function from its mocked selector on every render.
That unstable identity could retrigger the effect and conceal missing or incorrect dependency
behavior.

### Download-path identity leakage

Trace sanitization redacted values only when their object key matched a configured identity key.
`storedPath`, `resolvedPath`, and `expectedPath` did not match that policy, and arbitrary strings
were only truncated. `serializeError()` also truncated `message` and `stack` directly. As a
result, `downloads/<libraryItemId>/...` remained in path attributes and serialized errors written
to persisted dumps.

## Files changed

- `src/providers/BookmarkSyncProvider.tsx`
- `src/providers/__tests__/BookmarkSyncProvider.test.tsx`
- `src/stores/slices/userProfileSlice.ts`
- `src/stores/slices/__tests__/userProfileSlice.test.ts`
- `src/lib/trace.ts`
- `src/lib/__tests__/trace.test.ts`
- `src/lib/__tests__/traceDump.test.ts`

`src/lib/traceDump.ts` required no new edit because it already serializes the entire dump through
the central `sanitizeTracePayload()` boundary.

## Red evidence

### Bookmark lifecycle and serialization

Command:

```bash
npm test -- --runInBand src/providers/__tests__/BookmarkSyncProvider.test.tsx src/stores/slices/__tests__/userProfileSlice.test.ts
```

Observed before production edits: 2 suites failed, 4 tests failed.

- The deferred user-1 create completed after `resetUserProfile()` and called `upsertBookmark()`
  once, proving the stale local commit.
- Two unresolved drains called the remote create twice before either could clear the queued row;
  expected one call, received two.
- The provider passed no generation fence, so the logout/reauth regression received no first
  fence.
- A same-user server change did not invalidate or replace a fence because `serverUrl` was absent
  from provider lifecycle tracking.

### Trace persistence privacy

Command:

```bash
npm test -- --runInBand src/lib/__tests__/trace.test.ts src/lib/__tests__/traceDump.test.ts
```

Observed before production edits: 2 suites failed, 2 tests failed. Both exported and persisted JSON
contained the distinctive `library-item-private-7f3d9` value inside path attributes, error
messages, and error stacks.

## Implementation

### Auth-generation fence

- `BookmarkSyncProvider` now tracks `{ authStatus, userId, serverUrl }` in a layout-effect-owned
  ref and increments an identity generation whenever any member changes.
- Each eligible drain receives a `canContinue()` closure bound to the expected generation, user,
  authenticated status, and server.
- The slice additionally captures and rechecks the trimmed `activeUserId`.
- The drain rechecks authorization before every remote replay and before each SQLite upsert,
  pending-row clear, and remote reconciliation.
- `refreshBookmarks()` accepts the same optional fence and checks it before `fetchMe()` and before
  committing refreshed state.

### Single-flight/coalesced drain worker

- A per-store worker is retained in a `WeakMap` keyed by the slice getter.
- At most one drain pass runs at a time.
- An overlapping request sets one follow-up flag and retains the newest fence; multiple overlaps
  still coalesce to one follow-up pass.
- The active promise covers the follow-up pass, so all overlapping callers wait until the worker
  is idle.
- Existing FIFO replay and stop-on-first-remote-failure behavior remain unchanged.
- The regression models a second eligibility-triggered request while the remote create is
  unresolved. The active pass clears the row, the requested follow-up observes an empty queue,
  and the remote replay occurs once.
- Provider tests now expose one stable selected action identity and prove an unchanged rerender
  does not spuriously restart delivery.

### Central path and error sanitization

- `"path"` is now a central redacted-key substring, covering `storedPath`, `resolvedPath`,
  `expectedPath`, and other path-bearing attributes.
- A shared string sanitizer replaces the item segment immediately after `downloads/` or
  `downloads\` with `[REDACTED]`, case-insensitively, while retaining surrounding diagnostic
  context.
- The shared sanitizer applies to arbitrary strings, serialized fallback values, non-Error
  throws, and `Error.message`/`Error.stack`.
- Persistence tests prove the distinctive identifier is absent from the actual JSON passed to
  `File.write()`, while event/state diagnostics and `traceId`/`spanId` remain available.

## Green verification

Focused regression suites:

```bash
npm test -- --runInBand src/providers/__tests__/BookmarkSyncProvider.test.tsx src/stores/slices/__tests__/userProfileSlice.test.ts src/lib/__tests__/trace.test.ts src/lib/__tests__/traceDump.test.ts
```

Result: 4/4 suites passed; 55/55 tests passed.

Full Jest:

```bash
npm test -- --runInBand --silent
```

Result: 82/82 suites passed; 1,301 tests passed; 3 skipped; 0 failed.

Scoped ESLint:

```bash
npx eslint src/providers/BookmarkSyncProvider.tsx src/providers/__tests__/BookmarkSyncProvider.test.tsx src/stores/slices/userProfileSlice.ts src/stores/slices/__tests__/userProfileSlice.test.ts src/lib/trace.ts src/lib/__tests__/trace.test.ts src/lib/traceDump.ts src/lib/__tests__/traceDump.test.ts
```

Result: exit 0 with 0 errors. The command reports 13 pre-existing warnings in the touched legacy
files; the final-review changes add no warning.

Dependency and whitespace gates:

```bash
npm run check:circular
git diff --check
```

Result: no unexpected circular imports and no whitespace errors.

Full TypeScript:

```bash
npx tsc --noEmit --pretty false
```

Result: the repository baseline remains nonzero with 137 diagnostics. Zero diagnostics mention any
of the eight scoped production/test paths, including unchanged `src/lib/traceDump.ts`.

The commit hook additionally ran Prettier and related Jest tests over all seven staged files and
completed successfully.

## Commit

- `84375da09cc0630887018ffb2ecdb109ad7354fb` — `fix: fence bookmark drains and trace paths`

## Self-review

- Auth race: the old fence becomes permanently false across logout followed by same-user
  reauthentication, direct user changes, and same-user server changes.
- Active-user race: even a direct slice reset invalidates the captured user before the deferred
  remote response can upsert, clear, or refresh.
- Coalescing: one active worker and one boolean follow-up request prevent parallel dequeues while
  preserving a later eligibility attempt.
- Ordering: each pass consumes the database helper's FIFO result sequentially and still stops on
  the first replay failure.
- Failure semantics: unexpected pass failures are retained and surfaced after a requested
  follow-up receives its chance to run.
- Privacy: path-bearing keys are fully redacted; embedded download segments are redacted in
  arbitrary strings and error message/stack content; trace correlation IDs and non-sensitive
  state/counter/timing data remain.
- Scope: no `any`, dependencies, migrations, OTA behavior, coordinator test, or files outside the
  assigned ownership were changed.

## Concerns

- The full TypeScript baseline remains nonzero outside the scoped files (137 diagnostics).
- Jest continues to print the repository's existing stale `baseline-browser-mapping` notice and
  forced-exit/open-handle advisory after successful runs.
- Scoped ESLint retains 13 pre-existing warnings in legacy touched files, with zero errors and no
  new warning.
