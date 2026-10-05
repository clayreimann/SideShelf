/**
 * Tests for LocalTrace
 *
 * RED stubs — all tests reference @/lib/trace which does not exist yet.
 * These tests will fail until trace.ts is implemented.
 */

import { describe, expect, it, beforeEach } from "@jest/globals";
import { LocalTrace, sanitizeTracePayload } from "@/lib/trace";

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

    it("redacts nested identity attributes while preserving trace context and diagnostic fields", () => {
      const span = t.startSpan("sync-session", {
        userId: "user-1",
        libraryId: "library-1",
        libraryItemId: "library-item-1",
        itemId: "item-1",
        mediaId: "media-1",
        episodeId: "episode-1",
        sessionId: "session-1",
        restoreSessionId: "restore-session-1",
        deviceId: "device-1",
        state: "SYNCING_SESSION",
        retryCount: 3,
        timingMs: 250,
        nested: { userId: "nested-user-1", deviceId: "nested-device-1" },
      });
      t.addSpanEvent(span, "progress-sync.attempted", { sessionId: "session-1", attempt: 2 });
      t.endSpan(span);

      const [record] = t.exportTrace().records;
      const spanRecord = record as {
        traceId: string;
        spanId: string;
        name: string;
        attributes?: Record<string, unknown>;
        events?: { name: string; attributes?: Record<string, unknown> }[];
      };

      expect(spanRecord.traceId).not.toBe("[REDACTED]");
      expect(spanRecord.spanId).not.toBe("[REDACTED]");
      expect(spanRecord.name).toBe("sync-session");
      expect(spanRecord.attributes).toMatchObject({
        userId: "[REDACTED]",
        libraryId: "[REDACTED]",
        libraryItemId: "[REDACTED]",
        itemId: "[REDACTED]",
        mediaId: "[REDACTED]",
        episodeId: "[REDACTED]",
        sessionId: "[REDACTED]",
        restoreSessionId: "[REDACTED]",
        deviceId: "[REDACTED]",
        state: "SYNCING_SESSION",
        retryCount: 3,
        timingMs: 250,
        nested: { userId: "[REDACTED]", deviceId: "[REDACTED]" },
      });
      expect(spanRecord.events).toEqual([
        expect.objectContaining({
          name: "progress-sync.attempted",
          attributes: { sessionId: "[REDACTED]", attempt: 2 },
        }),
      ]);

      expect(
        sanitizeTracePayload({ traceId: "trace-1", spanId: "span-1", itemId: "item-1" })
      ).toEqual({
        traceId: "trace-1",
        spanId: "span-1",
        itemId: "[REDACTED]",
      });
    });

    it("sanitizes download item path segments in arbitrary strings and serialized errors", () => {
      const sensitiveLibraryItemId = "library-item-private-7f3d9";
      const path = `/documents/downloads/${sensitiveLibraryItemId}/chapter-01.m4b`;
      const span = t.startSpan("download-verification", {
        detail: `Checking ${path}`,
        storedPath: path,
      });
      const error = new Error(`Missing ${path}`);
      error.stack = `Error: Missing ${path}\n    at verifyDownload (DownloadService.ts:10:2)`;
      t.recordError(error, span);
      t.endSpan(span, "error");

      const [record] = t.exportTrace().records;
      const spanRecord = record as {
        traceId: string;
        spanId: string;
        attributes?: Record<string, unknown>;
        error?: { message: string; stack?: string };
      };

      expect(JSON.stringify(spanRecord)).not.toContain(sensitiveLibraryItemId);
      expect(spanRecord.traceId).not.toBe("[REDACTED]");
      expect(spanRecord.spanId).not.toBe("[REDACTED]");
      expect(spanRecord.attributes).toEqual({
        detail: "Checking /documents/downloads/[REDACTED]/chapter-01.m4b",
        storedPath: "[REDACTED]",
      });
      expect(spanRecord.error?.message).toBe(
        "Missing /documents/downloads/[REDACTED]/chapter-01.m4b"
      );
      expect(spanRecord.error?.stack).toContain("verifyDownload");
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
