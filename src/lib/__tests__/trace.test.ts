/**
 * Tests for LocalTrace
 *
 * RED stubs — all tests reference @/lib/trace which does not exist yet.
 * These tests will fail until trace.ts is implemented.
 */

import { describe, expect, it, beforeEach } from "@jest/globals";
import { LocalTrace } from "@/lib/trace";

describe("LocalTrace", () => {
  let t: LocalTrace;

  beforeEach(() => {
    t = new LocalTrace();
  });

  describe("RingBuffer wrapping", () => {
    it("wraps at capacity — push 3 items into a buffer of size 2, toArray returns only the last 2", () => {
      t.configure({ bufferSize: 2 });

      const span1 = t.startSpan("span-1");
      t.endSpan(span1);
      const span2 = t.startSpan("span-2");
      t.endSpan(span2);
      const span3 = t.startSpan("span-3");
      t.endSpan(span3);

      const records = t.exportTrace().records;
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({ name: "span-2" });
      expect(records[1]).toMatchObject({ name: "span-3" });
    });
  });

  describe("configure()", () => {
    it("changes bufferSize — resize triggers and new capacity is honoured", () => {
      // Fill with 5 spans at default size
      for (let i = 0; i < 5; i++) {
        const span = t.startSpan(`span-${i}`);
        t.endSpan(span);
      }

      // Resize to 3 — should keep last 3
      t.configure({ bufferSize: 3 });

      const records = t.exportTrace().records;
      expect(records).toHaveLength(3);
    });
  });

  describe("sanitizeValue", () => {
    it("redacts keys matching redactKeys (case-insensitive substring match)", () => {
      const span = t.startSpan("auth-span", { token: "abc-secret-value" });
      t.endSpan(span);

      const records = t.exportTrace().records;
      expect(records[0]).toMatchObject({ type: "span" });
      const spanRecord = records[0] as { attributes?: Record<string, unknown> };
      expect(spanRecord.attributes?.token).toBe("[REDACTED]");
    });

    it("truncates strings exceeding maxStringLength", () => {
      t.configure({ maxStringLength: 10 });
      const longString = "a".repeat(50);
      const span = t.startSpan("trunc-span", { description: longString });
      t.endSpan(span);

      const records = t.exportTrace().records;
      const spanRecord = records[0] as { attributes?: Record<string, unknown> };
      const desc = spanRecord.attributes?.description as string;
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeLessThanOrEqual(11); // 10 chars + ellipsis char
    });
  });

  describe("startSpan()", () => {
    it("returns a SpanHandle with a populated context (traceId, spanId)", () => {
      const handle = t.startSpan("my-span");

      expect(handle.context).toBeDefined();
      expect(typeof handle.context.traceId).toBe("string");
      expect(handle.context.traceId.length).toBeGreaterThan(0);
      expect(typeof handle.context.spanId).toBe("string");
      expect(handle.context.spanId.length).toBeGreaterThan(0);
    });
  });

  describe("endSpan()", () => {
    it("records the span into the buffer — exportTrace().records includes a SpanRecord with matching name", () => {
      const handle = t.startSpan("recorded-span");
      t.endSpan(handle);

      const { records } = t.exportTrace();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ type: "span", name: "recorded-span" });
    });
  });

  describe("addEvent()", () => {
    it("records an EventRecord into the buffer — exportTrace().records includes an EventRecord with matching name", () => {
      t.addEvent("my-event", { key: "value" });

      const { records } = t.exportTrace();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ type: "event", name: "my-event" });
    });
  });

  describe("exportTrace()", () => {
    it("returns { exportedAt, records } shape; records is an array", () => {
      const result = t.exportTrace();

      expect(typeof result.exportedAt).toBe("number");
      expect(Array.isArray(result.records)).toBe(true);
    });
  });

  describe("clear()", () => {
    it("empties the ring buffer — exportTrace().records is empty after clear", () => {
      const span = t.startSpan("to-be-cleared");
      t.endSpan(span);
      t.addEvent("event-to-clear");

      expect(t.exportTrace().records).toHaveLength(2);

      t.clear();

      expect(t.exportTrace().records).toHaveLength(0);
    });
  });
});
