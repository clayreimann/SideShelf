# Span Tracing — Design & Adoption Guide

A lightweight, local-only tracing library for React Native / Expo. No network calls — all telemetry stays in memory unless exported explicitly.

---

## Core Concepts

**Spans** — durations of work (startup, screen load, playback transition, network request).
**Events** — instantaneous occurrences (button press, state change, retry scheduled).

Both carry structured `attributes` and belong to a `traceId` / `spanId` hierarchy that mirrors OpenTelemetry's model without requiring the full OTel SDK.

---

## Data Model

```ts
type SpanRecord = {
  type: "span";
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status?: "ok" | "error" | "cancelled";
  attributes?: Record<string, unknown>;
  events?: SpanEvent[];
  error?: { name: string; message: string; stack?: string };
};

type EventRecord = {
  type: "event";
  timestamp: number;
  name: string;
  traceId?: string;
  spanId?: string;
  attributes?: Record<string, unknown>;
};
```

---

## API

```ts
import { trace } from "@/lib/trace";

// Preferred: wraps start/end/error automatically
await trace.withSpan("player.restore", { coldStart: true }, async (span) => {
  trace.addSpanEvent(span, "source.read.start");
  await readSource();
  trace.addSpanEvent(span, "source.read.done");
});

// Point-in-time event (attaches to current active span)
trace.addEvent("player.state.change", { from: "paused", to: "playing" });

// Manual span lifecycle
const span = trace.startSpan("player.load", { bookId });
try { ... trace.endSpan(span); }
catch (err) { trace.recordError(err, span); trace.endSpan(span, "error"); throw err; }

// Export
const json     = trace.exportTraceJSON({ appVersion: "1.0", platform: "ios" });
const timeline = trace.exportTimeline();
```

### Configuration (call once at app startup)

```ts
trace.configure({
  bufferSize: 800, // ring buffer; oldest records discarded when full
  maxEventsPerSpan: 30,
  redactKeys: ["token", "authorization", "password"],
});
```

---

## Context Propagation

Context flows automatically within `withSpan`. For async boundaries that lose context (timers, event emitters, navigation listeners), propagate manually:

```ts
const ctx = trace.getCurrentContext();

setTimeout(
  trace.bindContext(async () => {           // wraps fn, restores ctx at call time
    await trace.withSpan("delayed-work", {}, async () => { ... }, ctx);
  }, ctx),
  1000
);
```

Additional context utilities:

```ts
// Run a sync block under a specific context (used internally by withSpan)
trace.runWithContext(ctx, () => { ... });

// Run a sync block as a child of a span or context
trace.withChildContext(spanOrCtx, () => { ... });

// Create a child TraceContext without starting a span (for manual wiring)
const childCtx = trace.createChildContext(parentCtx);
```

---

## React Hooks

```ts
// Wrap a press handler in a span
const runPlayTap = useTraceSpan("ui.tap.play", { bookId });
onPress={() => runPlayTap(async (span) => { ... })}

// Mount/unmount lifecycle span for a screen
useLifecycleTrace("screen.player");

// Emit an event when deps change (state transition breadcrumbs)
useTraceEvent("player.state.change", { from, to }, [playerState]);

// Open span while `active === true`
useActiveSpan(isBuffering, "player.buffering");
```

---

## SideShelf Adoption: Two Target Domains

### 1. Cold-Start Player Restoration (`player.restore.*`)

**Structure:**

```
player.restore.session            ← root span (restoreSessionId)
  player.restore.source.memory    ← in-memory store check (found, itemId)
  player.restore.source.db        ← DB session query (found, sessionCount, itemId)
  player.restore.reconcile        ← decision span (winner, itemId, positionMs)
  player.restore.apply            ← track build + store write (itemId, isDownloaded, audioFileCount)
  player.restore.verify           ← post-apply store check (trackPresent, itemId)
```

Early exits (no span children) record `earlyExit` on the root span: `no_username` · `user_not_found` · `no_library_item_id` · `no_session` · `library_item_not_found` · `metadata_not_found` · `no_audio_files`

**Key events during reconcile** — record _why_ a candidate won or lost:

```ts
trace.addEvent("restore.candidate.accepted", {
  source,
  reason: "active_session",
  itemId,
  positionMs,
  restoreSessionId,
});
trace.addEvent("restore.decision.finalized", {
  source,
  itemId,
  positionMs,
  restoreSessionId,
});
```

Standard `reason` values: `active_session` · `missing_item_id` · `older_timestamp` · `no_existing_winner`

**Apply span** records its outcome as `endSpan` attributes — `itemId`, `positionMs`, `isDownloaded`, `audioFileCount`. Errors recorded via `trace.recordError(error, applySpan)`.

---

### 2. State Machine Transitions (`player.machine.*`)

Each non-high-frequency dispatch opens a `player.machine.dispatch` span, then emits:

```ts
trace.addEvent("player.machine.event.received", {
  event,      // e.g. "PLAYING"
  fromState,  // state machine believed it was in
  ...         // context snapshot (itemId, positionMs, etc.)
});

// Then one of:
trace.addEvent("player.machine.transition.accepted", { fromState, toState, ... });
trace.addEvent("player.machine.transition.rejected", { fromState, reason, ... });

// On actual state change:
trace.addEvent("player.machine.state.entered", { state, ... });
```

High-frequency events (`NATIVE_PROGRESS_UPDATED`) skip the dispatch span to avoid 1 Hz noise in the buffer.

**Session sync** is its own span:

```
player.session.sync               ← open on SESSION_SYNC_STARTED, closed on completed/failed
  session.sync.started
  session.sync.completed | session.sync.failed
```

**Recommended but not yet implemented:** a monotonic `sequence` number on every machine event would give absolute ordering when multiple callbacks fire within the same millisecond.

---

### 3. Correlating Restore & Machine Races

The real pain point is restore and machine transitions racing each other. Thread `restoreSessionId` through all restore-originated machine events:

```
player.restore.session            restoreSessionId=abc
player.machine.event.received     source=restore  event=QUEUE_RESTORED  restoreSessionId=abc
player.machine.transition.accepted  from=idle → restoring
player.machine.event.received     source=native_player  event=PLAYING
player.machine.transition.rejected  reason=unexpected_during_restoring
player.restore.apply.complete     restoreSessionId=abc
player.machine.transition.accepted  from=restoring → paused
```

This exposes races that raw logs cannot reconstruct.

---

## Helper Patterns

```ts
// Decision recorder (use during reconcile)
function addDecisionEvent(
  name: string,
  attrs: {
    domain: string;
    candidate?: string;
    winner?: string;
    reason: string;
    [key: string]: unknown;
  }
) {
  trace.addEvent(name, attrs);
}

// Machine event recorder (uniform shape across all dispatches)
function addMachineEvent(
  name: string,
  attrs: {
    machine: string;
    event: string;
    fromState: string;
    toState?: string;
    source: string;
    sequence: number;
    reason?: string;
    restoreSessionId?: string;
    [key: string]: unknown;
  }
) {
  trace.addEvent(name, attrs);
}
```

---

## Exporting for Debugging

Dumps are written to the Documents directory and managed via the TraceDumps dev menu screen:

```ts
import { writeDumpToDisk } from "@/lib/traceDump";

// Manual export (e.g. from dev menu)
await writeDumpToDisk("manual");

// On unhandled rejection (automatic)
await writeDumpToDisk("rejection", rejectionEvent);
```

Payload shape written to `trace-dump-<ISO>.json`:

```json
{ "exportedAt", "appVersion", "platform", "dumpReason", "rejectionEvent", "records" }
```

The TraceDumps screen (`src/app/(tabs)/more/trace-dumps.tsx`) lists, shares, and deletes dump files. The detail view (`trace-dump-detail.tsx`) renders a filterable timeline or raw JSON.

---

## Performance & Privacy

- No network I/O, no background threads; < 0.1 ms per event typical
- Trace workflows, not every function call; keep attributes small
- Never log: auth tokens, personal data, raw media metadata, filesystem paths
- `redactKeys` config automatically replaces matching keys with `[REDACTED]`

---

## What a Good Trace Answers

| Question                               | Signal                                            |
| -------------------------------------- | ------------------------------------------------- |
| Which restore source finished first?   | child span ordering                               |
| Which source was selected and why?     | reconcile decision events                         |
| Did apply succeed or fail?             | `player.restore.apply` span status + attributes   |
| Did the machine reject an event?       | `transition.rejected` + `reason`                  |
| Was the rejection a race condition?    | `restoreSessionId` correlation                    |
| Did stale state overwrite newer state? | `candidateUpdatedAt` vs `existingWinnerUpdatedAt` |
