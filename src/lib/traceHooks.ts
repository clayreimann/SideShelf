import * as React from "react";
import { SpanHandle, TraceAttributes, TraceContext, trace } from "@/lib/trace";

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
