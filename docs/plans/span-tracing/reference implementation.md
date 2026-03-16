Below is a compact reference implementation in TypeScript, plus a small React hook layer for React Native / Expo.

### `src/trace.ts`

```ts
/* rn-local-trace reference implementation
 *
 * Goals:
 * - local-only
 * - bounded in-memory ring buffer
 * - explicit, debuggable context propagation
 * - OTel-shaped model without full OTel SDK
 * - async-friendly withSpan helpers
 */

export type TraceAttributes = Record<string, unknown>;

export type SpanStatus = "ok" | "error" | "cancelled";

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
};

export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
};

export type SpanEvent = {
  timestamp: number;
  name: string;
  attributes?: TraceAttributes;
};

export type SpanRecord = {
  type: "span";
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status?: SpanStatus;
  attributes?: TraceAttributes;
  events?: SpanEvent[];
  error?: SerializedError;
};

export type EventRecord = {
  type: "event";
  timestamp: number;
  name: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  attributes?: TraceAttributes;
};

export type TraceRecord = SpanRecord | EventRecord;

export type SpanHandle = {
  context: TraceContext;
  name: string;
  startTime: number;
  defaultAttributes?: TraceAttributes;
  record: SpanRecord;
  ended: boolean;
};

export type TraceExport = {
  exportedAt: number;
  records: TraceRecord[];
  meta?: TraceAttributes;
};

export type TraceConfig = {
  bufferSize: number;
  maxEventsPerSpan: number;
  maxAttributeDepth: number;
  maxStringLength: number;
  redactKeys: string[];
  now?: () => number;
  wallNow?: () => number;
  onRecord?: (record: TraceRecord) => void;
};

const DEFAULT_CONFIG: TraceConfig = {
  bufferSize: 500,
  maxEventsPerSpan: 20,
  maxAttributeDepth: 4,
  maxStringLength: 500,
  redactKeys: ["password", "token", "authorization", "cookie", "secret"],
  now: () => Date.now(),
  wallNow: () => Date.now(),
};

function createId(): string {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

class RingBuffer<T> {
  private items: Array<T | undefined>;
  private start = 0;
  private count = 0;

  constructor(private capacity: number) {
    if (capacity < 1) throw new Error("RingBuffer capacity must be >= 1");
    this.items = new Array<T | undefined>(capacity);
  }

  push(item: T): void {
    if (this.count < this.capacity) {
      this.items[(this.start + this.count) % this.capacity] = item;
      this.count += 1;
      return;
    }
    this.items[this.start] = item;
    this.start = (this.start + 1) % this.capacity;
  }

  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.count; i += 1) {
      const value = this.items[(this.start + i) % this.capacity];
      if (value !== undefined) out.push(value);
    }
    return out;
  }

  clear(): void {
    this.items = new Array<T | undefined>(this.capacity);
    this.start = 0;
    this.count = 0;
  }

  resize(capacity: number): void {
    const current = this.toArray();
    this.capacity = Math.max(1, capacity);
    this.items = new Array<T | undefined>(this.capacity);
    this.start = 0;
    this.count = 0;

    const slice = current.slice(-this.capacity);
    for (const item of slice) this.push(item);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeError(error: unknown, cfg: TraceConfig): SerializedError {
  if (error instanceof Error) {
    const anyErr = error as Error & { cause?: unknown };
    return {
      name: error.name,
      message: truncateString(error.message, cfg.maxStringLength),
      stack: error.stack ? truncateString(error.stack, cfg.maxStringLength * 4) : undefined,
      cause: sanitizeValue(anyErr.cause, cfg, 1),
    };
  }

  return {
    name: "NonErrorThrown",
    message: truncateString(String(error), cfg.maxStringLength),
  };
}

function truncateString(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function sanitizeValue(value: unknown, cfg: TraceConfig, depth = 0): unknown {
  if (depth > cfg.maxAttributeDepth) return "[MaxDepth]";

  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value, cfg.maxStringLength);
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeValue(v, cfg, depth + 1));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (cfg.redactKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeValue(inner, cfg, depth + 1);
      }
    }
    return out;
  }

  try {
    return truncateString(JSON.stringify(value), cfg.maxStringLength);
  } catch {
    return `[Unserializable ${Object.prototype.toString.call(value)}]`;
  }
}

function sanitizeAttributes(
  attributes: TraceAttributes | undefined,
  cfg: TraceConfig
): TraceAttributes | undefined {
  if (!attributes) return undefined;
  return sanitizeValue(attributes, cfg, 0) as TraceAttributes;
}

export class LocalTrace {
  private cfg: TraceConfig = { ...DEFAULT_CONFIG };
  private buffer = new RingBuffer<TraceRecord>(DEFAULT_CONFIG.bufferSize);

  // Active context is intentionally explicit and shallow.
  // This helps for sync call trees and manual propagation.
  // For timers/event emitters/etc, callers should pass context explicitly.
  private contextStack: TraceContext[] = [];

  configure(partial: Partial<TraceConfig>): void {
    this.cfg = { ...this.cfg, ...partial };
    if (partial.bufferSize && partial.bufferSize !== this.cfg.bufferSize) {
      this.buffer.resize(partial.bufferSize);
    } else if (partial.bufferSize) {
      this.buffer.resize(partial.bufferSize);
    }
  }

  clear(): void {
    this.buffer.clear();
    this.contextStack = [];
  }

  getCurrentContext(): TraceContext | undefined {
    return this.contextStack[this.contextStack.length - 1];
  }

  setCurrentContext(ctx: TraceContext | undefined): void {
    if (ctx === undefined) {
      this.contextStack.pop();
      return;
    }
    this.contextStack.push(ctx);
  }

  runWithContext<T>(ctx: TraceContext | undefined, fn: () => T): T {
    if (!ctx) return fn();
    this.contextStack.push(ctx);
    try {
      return fn();
    } finally {
      const current = this.contextStack[this.contextStack.length - 1];
      if (current?.spanId === ctx.spanId) {
        this.contextStack.pop();
      } else {
        // defensive cleanup if stack got modified unexpectedly
        const idx = this.contextStack.findLastIndex((item) => item.spanId === ctx.spanId);
        if (idx >= 0) this.contextStack.splice(idx, 1);
      }
    }
  }

  startSpan(name: string, attributes?: TraceAttributes, parentContext?: TraceContext): SpanHandle {
    const parent = parentContext ?? this.getCurrentContext();
    const traceId = parent?.traceId ?? createId();
    const spanId = createId();

    const record: SpanRecord = {
      type: "span",
      traceId,
      spanId,
      parentSpanId: parent?.spanId,
      name,
      startTime: this.cfg.now!(),
      attributes: sanitizeAttributes(attributes, this.cfg),
      events: [],
    };

    return {
      context: {
        traceId,
        spanId,
        parentSpanId: parent?.spanId,
      },
      name,
      startTime: record.startTime,
      defaultAttributes: record.attributes,
      record,
      ended: false,
    };
  }

  endSpan(span: SpanHandle, status: SpanStatus = "ok", extraAttributes?: TraceAttributes): void {
    if (span.ended) return;

    span.ended = true;
    const endTime = this.cfg.now!();

    span.record.endTime = endTime;
    span.record.durationMs = Math.max(0, endTime - span.record.startTime);
    span.record.status = status;

    if (extraAttributes) {
      span.record.attributes = {
        ...(span.record.attributes ?? {}),
        ...sanitizeAttributes(extraAttributes, this.cfg),
      };
    }

    if (span.record.events && span.record.events.length === 0) {
      delete span.record.events;
    }

    this.pushRecord(span.record);
  }

  addEvent(name: string, attributes?: TraceAttributes, ctx?: TraceContext): void {
    const context = ctx ?? this.getCurrentContext();

    const record: EventRecord = {
      type: "event",
      timestamp: this.cfg.now!(),
      name,
      traceId: context?.traceId,
      spanId: context?.spanId,
      parentSpanId: context?.parentSpanId,
      attributes: sanitizeAttributes(attributes, this.cfg),
    };

    this.pushRecord(record);
  }

  addSpanEvent(span: SpanHandle, name: string, attributes?: TraceAttributes): void {
    if (span.ended) return;
    if (!span.record.events) span.record.events = [];

    if (span.record.events.length >= this.cfg.maxEventsPerSpan) {
      span.record.events.shift();
    }

    span.record.events.push({
      timestamp: this.cfg.now!(),
      name,
      attributes: sanitizeAttributes(attributes, this.cfg),
    });
  }

  recordError(
    error: unknown,
    target?: SpanHandle | TraceContext,
    attributes?: TraceAttributes
  ): void {
    const serialized = serializeError(error, this.cfg);

    if (target && "record" in target) {
      target.record.error = serialized;
      if (attributes) {
        target.record.attributes = {
          ...(target.record.attributes ?? {}),
          ...sanitizeAttributes(attributes, this.cfg),
        };
      }
      return;
    }

    const ctx = target && "traceId" in target ? target : this.getCurrentContext();

    this.addEvent(
      "error",
      {
        ...(attributes ?? {}),
        error: serialized,
      },
      ctx
    );
  }

  async withSpan<T>(
    name: string,
    attributes: TraceAttributes | undefined,
    fn: (span: SpanHandle) => Promise<T> | T,
    parentContext?: TraceContext
  ): Promise<T> {
    const span = this.startSpan(name, attributes, parentContext);

    return this.runWithContext(span.context, async () => {
      try {
        const result = await fn(span);
        this.endSpan(span, "ok");
        return result;
      } catch (error) {
        this.recordError(error, span);
        this.endSpan(span, "error");
        throw error;
      }
    });
  }

  withChildContext<T>(spanOrCtx: SpanHandle | TraceContext, fn: () => T): T {
    const ctx = "context" in spanOrCtx ? spanOrCtx.context : spanOrCtx;
    return this.runWithContext(ctx, fn);
  }

  createChildContext(parent?: TraceContext): TraceContext {
    const base = parent ?? this.getCurrentContext();
    return {
      traceId: base?.traceId ?? createId(),
      spanId: createId(),
      parentSpanId: base?.spanId,
    };
  }

  bindContext<A extends unknown[], R>(
    fn: (...args: A) => R,
    ctx?: TraceContext
  ): (...args: A) => R {
    const bound = ctx ?? this.getCurrentContext();
    return (...args: A) => this.runWithContext(bound, () => fn(...args));
  }

  exportTrace(meta?: TraceAttributes): TraceExport {
    return {
      exportedAt: this.cfg.wallNow!(),
      records: this.buffer.toArray(),
      meta: sanitizeAttributes(meta, this.cfg),
    };
  }

  exportTraceJSON(meta?: TraceAttributes, pretty = true): string {
    return JSON.stringify(this.exportTrace(meta), null, pretty ? 2 : 0);
  }

  exportTimeline(): string {
    const records = this.buffer.toArray();
    if (records.length === 0) return "";

    const firstTimestamp = this.getFirstTimestamp(records);

    const lines: string[] = records.map((record) => {
      if (record.type === "event") {
        const offset = record.timestamp - firstTimestamp;
        const attrs = record.attributes ? ` ${safeInlineJson(record.attributes)}` : "";
        const ctx = record.traceId ? ` trace=${record.traceId.slice(0, 8)}` : "";
        const span = record.spanId ? ` span=${record.spanId.slice(0, 8)}` : "";
        return `[+${offset}ms] event ${record.name}${ctx}${span}${attrs}`;
      }

      const offset = record.startTime - firstTimestamp;
      const dur = record.durationMs != null ? ` duration=${record.durationMs}ms` : "";
      const status = record.status ? ` status=${record.status}` : "";
      const attrs = record.attributes ? ` ${safeInlineJson(record.attributes)}` : "";
      const err = record.error ? ` error=${safeInlineJson(record.error)}` : "";
      return `[+${offset}ms] span ${record.name} trace=${record.traceId.slice(0, 8)} span=${record.spanId.slice(0, 8)}${status}${dur}${attrs}${err}`;
    });

    return lines.join("\n");
  }

  getRecords(): TraceRecord[] {
    return this.buffer.toArray();
  }

  private getFirstTimestamp(records: TraceRecord[]): number {
    let min = Number.POSITIVE_INFINITY;
    for (const record of records) {
      const t = record.type === "event" ? record.timestamp : record.startTime;
      if (t < min) min = t;
    }
    return Number.isFinite(min) ? min : 0;
  }

  private pushRecord(record: TraceRecord): void {
    this.buffer.push(record);
    this.cfg.onRecord?.(record);
  }
}

function safeInlineJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[Unserializable]"';
  }
}

export const trace = new LocalTrace();
```

---

### `src/hooks.ts`

```ts
import * as React from "react";
import { SpanHandle, TraceAttributes, TraceContext, trace } from "./trace";

export function useTrace() {
  return trace;
}

/**
 * Stable callback that runs with the current trace context captured at render time.
 * Useful when handing callbacks to event emitters, navigation listeners, timers, etc.
 */
export function useTraceCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
  deps: React.DependencyList = [],
  ctx?: TraceContext
): (...args: A) => R {
  const context = ctx ?? trace.getCurrentContext();

  return React.useMemo(() => {
    return trace.bindContext(fn, context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Returns a function that starts a root or child span for event handlers.
 *
 * Example:
 * const runPlayTap = useTraceSpan("ui.tap.play", { screen: "player" })
 * onPress={() => runPlayTap(async () => { ... })}
 */
export function useTraceSpan(
  name: string,
  baseAttributes?: TraceAttributes,
  parentContext?: TraceContext
) {
  return React.useCallback(
    async <T>(
      fn: (span: SpanHandle) => Promise<T> | T,
      callAttributes?: TraceAttributes
    ): Promise<T> => {
      const attrs = {
        ...(baseAttributes ?? {}),
        ...(callAttributes ?? {}),
      };

      return trace.withSpan(name, attrs, fn, parentContext);
    },
    [name, baseAttributes, parentContext]
  );
}

/**
 * Emits a mount/unmount lifecycle span for a component or screen.
 * Good for screens, player surface, or complex mounted subsystems.
 */
export function useLifecycleTrace(name: string, attributes?: TraceAttributes): void {
  React.useEffect(() => {
    const span = trace.startSpan(name, attributes);
    trace.addSpanEvent(span, "mounted");

    return () => {
      trace.addSpanEvent(span, "unmounted");
      trace.endSpan(span, "ok");
    };
    // caller controls stability of attributes/name
  }, [name, attributes]);
}

/**
 * Emits a point-in-time event when dependencies change.
 * Helpful for state transition breadcrumbs.
 */
export function useTraceEvent(
  name: string,
  attributes?: TraceAttributes,
  deps: React.DependencyList = []
): void {
  React.useEffect(() => {
    trace.addEvent(name, attributes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Keeps a span open while `active === true`.
 * Useful for buffering/loading/connecting states.
 */
export function useActiveSpan(active: boolean, name: string, attributes?: TraceAttributes): void {
  const spanRef = React.useRef<SpanHandle | null>(null);

  React.useEffect(() => {
    if (active && !spanRef.current) {
      spanRef.current = trace.startSpan(name, attributes);
      trace.addSpanEvent(spanRef.current, "active.true");
    }

    if (!active && spanRef.current) {
      trace.addSpanEvent(spanRef.current, "active.false");
      trace.endSpan(spanRef.current, "ok");
      spanRef.current = null;
    }

    return () => {
      if (spanRef.current) {
        trace.addSpanEvent(spanRef.current, "cleanup");
        trace.endSpan(spanRef.current, "cancelled");
        spanRef.current = null;
      }
    };
  }, [active, name, attributes]);
}
```

---

### `src/index.ts`

```ts
export * from "./trace";
export * from "./hooks";
```

---

## Integration notes

Initialize once near app startup:

```ts
import { trace } from "./trace";

trace.configure({
  bufferSize: 800,
  maxEventsPerSpan: 30,
  redactKeys: ["token", "authorization", "password", "cookie"],
});
```

Example button handler:

```ts
import { useTraceSpan } from "./hooks"

function PlayButton({ bookId }: { bookId: string }) {
  const runPlayTap = useTraceSpan("ui.tap.play", { bookId })

  const onPress = () =>
    runPlayTap(async (span) => {
      // these span events stay inside the parent span record
      trace.addSpanEvent(span, "load.player.state.start")
      await restorePlayerState(bookId)
      trace.addSpanEvent(span, "load.player.state.done")

      trace.addEvent("player.command.play", { bookId })
      await player.play()
    })

  return <Button title="Play" onPress={onPress} />
}
```

Example explicit context propagation across a timer:

```ts
import { trace } from "./trace";

async function scheduleRetry() {
  await trace.withSpan("download.retry.schedule", undefined, async () => {
    const ctx = trace.getCurrentContext();

    setTimeout(
      trace.bindContext(async () => {
        await trace.withSpan(
          "download.retry.execute",
          undefined,
          async () => {
            await retryDownload();
          },
          ctx
        );
      }, ctx),
      1000
    );
  });
}
```

Example export:

```ts
const json = trace.exportTraceJSON({
  appVersion: "1.0.0",
  platform: "ios",
  screen: "player",
});

const timeline = trace.exportTimeline();
```

## Context propagation model

This implementation is intentionally **explicit-first**.

What works automatically:

- nested sync calls inside `withSpan`
- code run through `trace.runWithContext`
- callbacks wrapped with `trace.bindContext`

What should usually be manual:

- timers
- event emitters
- navigation listeners
- background tasks
- callbacks stored and invoked later

That tradeoff is deliberate: it keeps behavior understandable in React Native instead of hiding it behind fragile async-magic.

## Practical next improvements

The next layer I would add for your Audiobookshelf case is:

- a tiny Expo export helper using `expo-file-system` + `expo-sharing`
- a React Navigation helper that emits `screen.view` events
- optional persisted “last 100 records” tail for crash-following startup debugging

I can write those three next as well.
