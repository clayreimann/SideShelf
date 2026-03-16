# RN Local Trace

**A lightweight, local-only tracing library for React Native / Expo apps**

RN Local Trace provides **structured spans and events for debugging mobile apps**, without any cloud dependency or external telemetry pipeline.

It is designed for:

- **Local-only debugging**
- **Small ring buffer of recent activity**
- **Exportable traces for analysis or AI debugging**
- **Explicit async context propagation**
- **Minimal runtime overhead**
- **Expo + React Native compatibility**

The design follows an **OpenTelemetry-like span model**, but intentionally avoids the full OTel SDK and exporters.

This makes it ideal for:

- hobby projects
- open source apps
- privacy-sensitive apps
- debugging async workflows
- reproducing timing bugs

---

# Features

- **Span-based tracing**
- **Point-in-time events**
- **Structured attributes**
- **Explicit async context propagation**
- **Bounded in-memory ring buffer**
- **Error capture and span status**
- **JSON export of recent traces**
- **Human-readable timeline export**
- **Works in Expo and React Native**

No network calls are performed. All telemetry stays **in memory unless exported explicitly**.

---

# Example

```ts
import { trace } from "rn-local-trace";

async function loadBook(bookId: string) {
  return trace.withSpan("book.load", { bookId }, async (span) => {
    trace.addEvent("storage.read.start");

    const data = await loadFromStorage(bookId);

    trace.addEvent("storage.read.complete");

    return data;
  });
}
```

Export recent activity:

```ts
const json = trace.exportTraceJSON();
const timeline = trace.exportTimeline();
```

---

# Table of Contents

- [Concepts](#concepts)
- [Data Model](#data-model)
- [API Reference](#api-reference)
- [Context Propagation](#context-propagation)
- [Buffer Management](#buffer-management)
- [Exporting Traces](#exporting-traces)
- [Integration Guide](#integration-guide)
- [Instrumentation Patterns](#instrumentation-patterns)
- [Performance Considerations](#performance-considerations)
- [Privacy & Redaction](#privacy--redaction)
- [Example Debug Workflow](#example-debug-workflow)

---

# Concepts

RN Local Trace uses two primary signal types:

### Spans

Spans represent **durations of work**.

Examples:

- app startup
- screen load
- playback transition
- sync workflow
- network request
- background task

Spans capture:

- start time
- end time
- attributes
- child spans
- errors
- intermediate events

---

### Events

Events represent **instantaneous occurrences**.

Examples:

- button press
- player state change
- queue update
- retry scheduled

Events may optionally belong to a span.

---

# Data Model

## Span

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

  error?: SerializedError;
};
```

---

## Event

```ts
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

## Error

```ts
type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};
```

---

# API Reference

## Import

```ts
import { trace } from "rn-local-trace";
```

---

# Core APIs

## startSpan

Creates a span manually.

```ts
const span = trace.startSpan("player.load", { bookId: "123" }, parentContext);
```

Returns:

```ts
SpanHandle;
```

---

## endSpan

Ends a span.

```ts
trace.endSpan(span);
```

Optional status:

```ts
trace.endSpan(span, "cancelled");
```

---

## withSpan

Preferred API for tracing async functions.

Automatically:

- creates span
- captures errors
- ends span

```ts
await trace.withSpan("download.chapter", { chapterId }, async () => {
  await downloadChapter();
});
```

Equivalent manual version:

```ts
const span = trace.startSpan("download.chapter");

try {
  await downloadChapter();
  trace.endSpan(span);
} catch (err) {
  trace.recordError(err, span);
  trace.endSpan(span, "error");
  throw err;
}
```

---

## addEvent

Adds an event to the current span or root trace.

```ts
trace.addEvent("player.pause");
```

With attributes:

```ts
trace.addEvent("player.seek", {
  position: 123.4,
});
```

Attach to explicit context:

```ts
trace.addEvent("cache.miss", {}, spanContext);
```

---

## recordError

Records an error.

```ts
trace.recordError(error);
```

Or attach to a specific span:

```ts
trace.recordError(error, spanContext);
```

---

## getCurrentContext

Returns the current active context.

```ts
const ctx = trace.getCurrentContext();
```

---

## setCurrentContext

Sets the active context.

```ts
trace.setCurrentContext(context);
```

Useful when manually propagating traces.

---

# Context Propagation

## Why context propagation matters

Tracing only works if **child operations know their parent span**.

Example chain:

```
tap play
  -> load metadata
  -> fetch chapter
  -> initialize player
```

Each step should belong to the same trace.

---

## Trace Context

Context consists of:

```ts
type TraceContext = {
  traceId: string;
  spanId: string;
};
```

---

## Automatic propagation (within withSpan)

```ts
trace.withSpan("play.tap", async () => {
  await loadMetadata();
});
```

Inside `loadMetadata`, the span context is available.

---

## Manual propagation

Some async boundaries lose context:

- event emitters
- timers
- external callbacks
- background tasks

In these cases, pass context manually.

Example:

```ts
const ctx = trace.getCurrentContext();

setTimeout(() => {
  trace.withSpan(
    "delayed-work",
    {},
    async () => {
      doSomething();
    },
    ctx
  );
}, 100);
```

---

## Pattern: workflow context

For multi-step workflows, propagate context explicitly.

```ts
async function syncLibrary(ctx) {
  return trace.withSpan(
    "library.sync",
    {},
    async () => {
      await step1(ctx);
      await step2(ctx);
    },
    ctx
  );
}
```

---

# Buffer Management

RN Local Trace stores records in a **bounded ring buffer**.

This prevents memory growth.

Default size:

```
500 records
```

Configurable:

```ts
trace.configure({
  bufferSize: 1000,
});
```

When full:

- oldest records are discarded
- newest events always preserved

---

# Exporting Traces

Two export formats are available.

---

## JSON export

```ts
trace.exportTraceJSON();
```

Example output:

```json
{
  "appVersion": "1.2.3",
  "platform": "ios",
  "timestamp": 1710000000000,
  "records": [...]
}
```

Ideal for:

- debugging tools
- AI analysis
- bug reports

---

## Timeline export

Human-readable view:

```
[0ms] span start app.launch
[10ms] event navigation.ready
[120ms] span start book.load
[350ms] event storage.read.complete
[420ms] span end book.load
```

Usage:

```ts
trace.exportTimeline();
```

---

# Integration Guide

## Installation

```
npm install rn-local-trace
```

or

```
yarn add rn-local-trace
```

---

## Expo setup

No native code required.

Works in:

- Expo
- Expo dev client
- React Native CLI

---

## Initialize tracing

Initialize once during app startup.

Example:

```ts
import { trace } from "rn-local-trace";

trace.configure({
  bufferSize: 800,
  captureErrors: true,
});
```

Recommended location:

```
App.tsx
```

---

## Add debug export

Example using Expo Sharing.

```ts
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

async function exportDebugTrace() {
  const data = trace.exportTraceJSON();

  const path = FileSystem.cacheDirectory + "trace.json";

  await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2));

  await Sharing.shareAsync(path);
}
```

---

## Optional: persist crash tail

If desired, store the final records on crash.

Example pattern:

```
last 100 records -> AsyncStorage
```

Useful for debugging crashes on next launch.

---

# Instrumentation Patterns

## User actions

```ts
trace.withSpan("ui.tap.play");
```

---

## Navigation

```ts
trace.withSpan("screen.open", {
  screen: "player",
});
```

---

## Network

```ts
trace.withSpan("api.request", {
  endpoint: "/books",
});
```

---

## Storage

```ts
trace.withSpan("storage.read", {
  key: "playerState",
});
```

---

## Player state transitions

```ts
trace.addEvent("player.state.change", {
  from: "paused",
  to: "playing",
});
```

---

# Performance Considerations

RN Local Trace is designed to have minimal overhead.

Characteristics:

- no network I/O
- no background threads
- small object allocations
- bounded memory

Typical overhead:

```
< 0.1ms per event
```

Recommendations:

- do not trace every function
- trace workflows instead
- keep attributes small

---

# Privacy & Redaction

Exported traces may contain:

- screen names
- item identifiers
- state transitions

Avoid logging:

- authentication tokens
- personal data
- raw media metadata
- filesystem paths

Implement optional redaction:

```ts
trace.configure({
  redactKeys: ["token", "password"],
});
```

---

# Example Debug Workflow

User reports playback failure.

Developer requests trace export.

User exports recent trace.

Timeline:

```
tap.play
  -> metadata.load
  -> chapter.fetch
  -> player.initialize
  -> error.audio-decoder
```

Developer quickly identifies the failing step.

---

# When to Use RN Local Trace

Good fit for:

- debugging async workflows
- hobby apps
- open source projects
- local-first tooling
- AI-assisted debugging

Not intended for:

- production telemetry pipelines
- cloud observability
- distributed tracing

---

# Future Extensions

Possible future improvements:

- optional OpenTelemetry export
- React Navigation instrumentation
- async context helpers
- Redux / Zustand instrumentation
- persisted trace buffers
- automated span sampling

---

# License

MIT

---

If you'd like, I can also write:

- **A complete TypeScript reference implementation (~250 lines)**
- **A React hook layer (`useTraceSpan`)**
- **An Expo debug UI panel to visualize traces live**

Those three pieces together turn this into an extremely powerful debugging tool for complex React Native apps.
