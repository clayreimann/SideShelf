# Queue-Rebuild Position Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Prevent internal native positions emitted while rebuilding the audio queue from overwriting playback progress or entering jump history.

**Architecture:** Add a bounded, item-scoped queue-rebuild reconciliation record to `PlayerStateCoordinator`. Arm it after rebuild and smart rewind targets are known, classify native progress before context mutation, and clear it on unrelated progress, explicit movement, lifecycle replacement, error, or timeout.

**Tech Stack:** TypeScript, React Native Track Player, Jest

## Global Constraints

- Never globally ignore native position `0`.
- Do not change ordinary explicit seek, relative jump, or smart-rewind-only behavior.
- Do not change progress-source priority or persisted-state restoration.
- Keep all native progress handling serialized through `PlayerStateCoordinator`.

---

### Task 1: Reproduce and guard queue-rebuild reconciliation

**Files:**

- Modify: `src/services/coordinator/PlayerStateCoordinator.ts`
- Test: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`

**Interfaces:**

- Consumes: `ResumePositionInfo.position`, optional `SmartRewindOutcome`, and `NATIVE_PROGRESS_UPDATED`
- Produces: item-scoped internal reconciliation that distinguishes transient, target, and unrelated native positions

- [x] **Step 1: Write failing coordinator tests**

Add a test that restores an item, performs the inline `PLAY` queue rebuild to
position `120`, then dispatches native progress at `0` and `120`. Assert that
context/store position never becomes `0` and `_recordJump` remains untouched.
Add safety assertions proving an explicit `SEEK` to `0` is still recorded and
that later unrelated native movement remains detectable.

- [x] **Step 2: Run the focused test and verify RED**

```bash
npx jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --runInBand -t "queue rebuild reconciliation"
```

Expected: the reset-position test fails because the current coordinator accepts
native `0`, changes context position, and records an unexpected jump.

- [x] **Step 3: Add queue-rebuild reconciliation state**

Add an item-scoped record with transient positions, target position, generation,
and a bounded timeout. Provide private arm, classify, and clear methods. Reset
the record during singleton teardown.

- [x] **Step 4: Classify progress before context mutation**

For `NATIVE_PROGRESS_UPDATED`, suppress context position mutation for transient
matches, accept target matches without history, and clear then normally process
unrelated positions. Continue syncing the unchanged authoritative position to
the store when a transient report is suppressed.

- [x] **Step 5: Arm and cancel at coordinator-owned boundaries**

Capture the inline rebuild resume position. After `executePlay()` returns, arm
the queue reconciliation with `0`, the intermediate resume position when smart
rewind changed it, and the final target. Clear it on explicit seek/jump,
`LOAD_TRACK`, `RESTORE_STATE`, `STOP`, and native errors.

- [x] **Step 6: Verify focused and whole-branch behavior**

Run the focused tests, the full coordinator suite, restoration/player tests,
TypeScript, lint on changed TypeScript files, the full Jest suite, and
`git diff --check`.
