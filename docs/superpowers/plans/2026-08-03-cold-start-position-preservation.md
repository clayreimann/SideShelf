# Cold-Start Position Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Preserve the selected book's persisted nonzero position across a cold app start.

**Architecture:** Keep the startup lifecycle event, but exclude `APP_FOREGROUNDED` from the coordinator-to-store projection because its context is intentionally unhydrated. Preserve the existing full bridge for all state-bearing structural events.

**Tech Stack:** TypeScript, React Native, Zustand, Jest

## Global Constraints

- Do not remove `APP_FOREGROUNDED` from startup tracing or the transition matrix.
- Do not change persistence behavior for other coordinator events.
- Do not address the separate native queue-seek reconciliation race in this change.

---

### Task 1: Protect persisted player state from the startup lifecycle event

**Files:**

- Modify: `src/services/coordinator/PlayerStateCoordinator.ts`
- Test: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`

**Interfaces:**

- Consumes: `PlayerEvent` with `type: "APP_FOREGROUNDED"`
- Produces: lifecycle processing without calls to player-slice persistence mutators

- [x] **Step 1: Write the failing regression test**

Add a test that dispatches `APP_FOREGROUNDED` on a fresh coordinator and asserts
that `updatePosition`, `updatePlayingState`, `_setCurrentTrack`,
`_setPlaybackRate`, `_setVolume`, and `_setPlaySessionId` are not called.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --runInBand
```

Expected: the new test fails because `syncStateToStore()` currently calls the
persisted state mutators for `APP_FOREGROUNDED`.

- [x] **Step 3: Implement the minimal event-boundary guard**

In the post-transition bridge selection, retain `syncPositionToStore()` for
`NATIVE_PROGRESS_UPDATED`, skip store synchronization for
`APP_FOREGROUNDED`, and retain `syncStateToStore(event)` for every other event.

- [x] **Step 4: Verify focused and whole-branch behavior**

Run the focused coordinator test, related tests, TypeScript, lint for changed
files, the full Jest suite, and `git diff --check`.
