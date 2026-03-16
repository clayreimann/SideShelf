# First adoption

## Prompt

Right now one of my biggest headaches is player state restoration after cold starts. It involves reconciling two or three different places that it could have been persisted and involves several asynchronous calls. I’m hoping that I can use these traces to see what’s happening. Also a headache is when the player state machine gets transitions that it’s not expecting. Both of these are inconsistently problematic so debugging with standard logging has been painful at best

---

## Response

Yes — those are exactly the kinds of problems this tracer should help with.

Both issues share the same core pain:

- they are **async**
- they are **order-dependent**
- they are **intermittent**
- raw logs make it hard to reconstruct **causality**

A trace timeline is much better for this because it can answer:

- what kicked off restoration
- which persistence source responded first
- which source “won”
- whether stale data overwrote fresher data
- whether a state transition happened before some prerequisite finished
- which unexpected event hit the state machine, and what state it believed it was in at that moment

## What I’d do first

I would treat these as **two named debug domains** in the library usage:

1. `player.restore.*`
2. `player.machine.*`

And I would be fairly opinionated about the shape of the spans and events so the exported timeline is easy to read.

---

# 1. Player restoration tracing

For cold start restoration, I would make one **root span** for the whole restore attempt:

- `player.restore.session`

Then child spans for each source of persisted truth:

- `player.restore.source.memory`
- `player.restore.source.async_storage`
- `player.restore.source.filesystem`
- `player.restore.source.native`
- `player.restore.source.track_player`

Then a reconciliation span:

- `player.restore.reconcile`

Then an application span:

- `player.restore.apply`

Then maybe final verification:

- `player.restore.verify`

That gives you a timeline like:

```text
player.restore.session
  player.restore.source.async_storage
  player.restore.source.filesystem
  player.restore.source.track_player
  player.restore.reconcile
  player.restore.apply
  player.restore.verify
```

## What to record on each source read

For each source, record attributes like:

- `source`
- `found` true/false
- `positionMs`
- `chapterId`
- `itemId`
- `updatedAt`
- `sessionId`
- `playbackState`
- `queueIndex`
- `hasError`
- `dataAgeMs` if derivable

Do **not** dump giant blobs by default. Prefer a small summary.

Example summary helper:

```ts
function summarizePersistedPlayerState(state: unknown) {
  if (!state || typeof state !== "object") return { present: false };

  const s = state as Record<string, unknown>;

  return {
    present: true,
    itemId: s.itemId,
    chapterId: s.chapterId,
    positionMs: s.positionMs,
    queueIndex: s.queueIndex,
    playbackState: s.playbackState,
    updatedAt: s.updatedAt,
    sessionId: s.sessionId,
  };
}
```

## What to record during reconciliation

This is the important part. Raw logging often tells you what each source returned, but not **why one source beat another**.

Your reconcile span should log decision events like:

- `restore.candidate.accepted`
- `restore.candidate.rejected`
- `restore.candidate.superseded`
- `restore.decision.finalized`

With attributes like:

- `source`
- `reason`
- `existingWinnerSource`
- `existingWinnerUpdatedAt`
- `candidateUpdatedAt`
- `candidatePositionMs`
- `winnerPositionMs`

Reasons should be standardized strings, for example:

- `missing_item_id`
- `older_timestamp`
- `missing_timestamp`
- `invalid_position`
- `queue_mismatch`
- `better_completeness`
- `track_player_authoritative`
- `async_storage_authoritative`
- `no_existing_winner`

That way when you export to AI or inspect it yourself, you are not inferring the reconcile logic from code and logs — the app tells you its actual decision path.

## What to record during apply

This should answer: did we decide correctly, but apply incorrectly?

Record:

- `restore.apply.start`
- `restore.apply.set_queue`
- `restore.apply.seek`
- `restore.apply.set_rate`
- `restore.apply.set_playing`
- `restore.apply.complete`

And include:

- target item/chapter/position
- previous in-memory player state
- current native/player-engine state before apply
- whether apply was partial
- whether any step was skipped

Skipped steps are very important. A huge amount of “restore is flaky” comes down to silent no-ops.

---

# 2. State machine tracing

For unexpected transitions, I would not just trace “an event happened.” I would trace:

- what event was received
- what state the machine thought it was in
- what context it had
- whether the transition was valid
- what new state was entered
- whether side effects were triggered
- whether the event was ignored, deferred, or errored

## Minimum event schema for machine debugging

Every machine event should emit something like:

- `player.machine.event.received`
- `player.machine.transition.accepted`
- `player.machine.transition.rejected`
- `player.machine.transition.ignored`
- `player.machine.state.entered`
- `player.machine.side_effect.started`
- `player.machine.side_effect.completed`
- `player.machine.side_effect.failed`

Attributes should include:

- `event`
- `fromState`
- `toState`
- `reason`
- `machineSessionId`
- `restoreSessionId` if relevant
- `trackId`
- `chapterId`
- `positionMs`
- `appState` foreground/background
- `source` of event

That last one matters a lot. Unexpected transitions are often only unexpected because the **source** is ambiguous. Distinguish:

- `ui`
- `restore`
- `native_player`
- `audio_focus`
- `remote_command`
- `queue_sync`
- `sleep_timer`
- `startup_bootstrap`

## Very important: sequence numbers

For machine debugging, add a monotonic `sequence` number to every machine event.

That gives you absolute ordering even when timestamps are close.

Example:

- `sequence: 41`
- `sequence: 42`
- `sequence: 43`

This is extremely helpful when multiple async callbacks fire within the same millisecond or the log timeline gets visually noisy.

## Snapshot machine context lightly

When an event is received, record a **small snapshot** of the machine context:

- `state`
- `itemId`
- `chapterId`
- `positionMs`
- `isBuffering`
- `isRestoring`
- `isQueueLoaded`
- `expectedEngineState`
- `actualEngineState` if known

Again, not the whole store. Just the debugging-critical fields.

---

# 3. The biggest likely win: correlate restore and machine traces

I suspect one of your real problems is not just “restore is wrong” or “machine is wrong,” but:

**restoration and machine transitions are racing each other**

Examples:

- restore emits `SET_PLAYING` before queue load completes
- native player emits `PLAYING` before JS machine has left `restoring`
- async storage restore finishes after track-player restore and overwrites it
- stale persisted state gets applied after newer live state is already established

So I would explicitly thread a `restoreSessionId` through all restore-originated machine events.

That lets you see things like:

```text
player.restore.session restoreSessionId=abc
player.machine.event.received source=restore event=QUEUE_RESTORED restoreSessionId=abc
player.machine.transition.accepted from=idle to=restoring
player.machine.event.received source=native_player event=PLAYING
player.machine.transition.rejected reason=unexpected_during_restoring
player.restore.apply.complete restoreSessionId=abc
player.machine.event.received source=restore event=RESTORE_DONE restoreSessionId=abc
player.machine.transition.accepted from=restoring to=paused
```

That is the kind of sequence ordinary logs usually fail to make obvious.

---

# 4. Concrete instrumentation helpers I’d add

I would extend the reference implementation with two small helpers.

## A. Decision recorder

```ts
type DecisionAttrs = {
  domain: string;
  candidate?: string;
  winner?: string;
  reason: string;
  [key: string]: unknown;
};

function addDecisionEvent(name: string, attrs: DecisionAttrs) {
  trace.addEvent(name, attrs);
}
```

Use for reconciliation steps.

## B. Machine event recorder

```ts
type MachineEventAttrs = {
  machine: string;
  event: string;
  fromState: string;
  toState?: string;
  source: string;
  sequence: number;
  reason?: string;
  restoreSessionId?: string;
  [key: string]: unknown;
};

function addMachineEvent(name: string, attrs: MachineEventAttrs) {
  trace.addEvent(name, attrs);
}
```

You want machine instrumentation to be extremely uniform.

---

# 5. Suggested span/event plan for your two pain points

## Cold start restore

Root span:

- `player.restore.session`

Events:

- `player.restore.started`
- `player.restore.sources.enumerated`
- `player.restore.candidate.accepted`
- `player.restore.candidate.rejected`
- `player.restore.decision.finalized`
- `player.restore.apply.skipped`
- `player.restore.completed`
- `player.restore.failed`

Child spans:

- `player.restore.source.<source>`
- `player.restore.reconcile`
- `player.restore.apply`
- `player.restore.verify`

Attributes to always include:

- `restoreSessionId`
- `coldStart: true`
- `appLaunchId`
- `trigger`
- `source`
- `itemId`
- `chapterId`
- `positionMs`
- `updatedAt`

## State machine

Events:

- `player.machine.event.received`
- `player.machine.transition.accepted`
- `player.machine.transition.rejected`
- `player.machine.transition.ignored`
- `player.machine.state.entered`
- `player.machine.state.exited`
- `player.machine.side_effect.started`
- `player.machine.side_effect.completed`
- `player.machine.side_effect.failed`

Attributes to always include:

- `machineSessionId`
- `sequence`
- `source`
- `event`
- `fromState`
- `toState`
- `restoreSessionId`
- `itemId`
- `chapterId`
- `positionMs`

---

# 6. One very useful pattern: trace envelopes around suspicious workflows

For intermittent bugs, I’d add a temporary “high detail mode” just around restore and machine transitions.

For example:

- normal mode: only root spans + major events
- high detail mode: every candidate comparison, state transition, and side effect

That keeps the ring buffer from filling with noise during normal use, but lets you crank detail up when chasing a flaky issue.

A simple config flag like:

```ts
const DEBUG_TRACE_RESTORE = true;
const DEBUG_TRACE_MACHINE = true;
```

is probably enough.

---

# 7. What success looks like

When this is working well, an exported timeline should let you answer questions like:

- Did restore read all sources?
- Which source finished first?
- Which source was selected and why?
- Did apply happen in the intended order?
- Did the machine reject an event?
- Was that rejection legitimate or evidence of a race?
- Did native/player callbacks arrive before the machine was ready?
- Did a stale persisted snapshot overwrite newer state?

If the trace cannot answer those, add more structured attributes and decision events until it can.

---

# 8. My recommendation for your next step

Before building more generic library features, I would instrument these two workflows first:

- `restorePlayerStateOnColdStart()`
- your machine transition handler / reducer / dispatcher

Those two areas are likely to give you immediate value.

I can write a concrete example next for:

- a traced `restorePlayerStateOnColdStart()` implementation with reconciliation spans
- a traced player state machine wrapper that records accepted/rejected transitions and side effects
