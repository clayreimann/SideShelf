/**
 * Tests for writeDumpToDisk
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

type MockProgressSyncDiagnostic = {
  sessionId: string;
  desiredRevision: number;
  acknowledgedRevision: number;
  attemptCount: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  hasError: boolean;
  terminalReason: string | null;
  updatedAt: Date;
};

const mockGetProgressSyncDiagnostics = jest.fn<() => Promise<MockProgressSyncDiagnostic[]>>();

// expo-file-system IS installed — mock its File API
jest.mock("expo-file-system", () => {
  const { jest } = require("@jest/globals");
  const mockWrite = jest.fn().mockResolvedValue(undefined);
  const MockFile = jest.fn().mockImplementation((_dir: unknown, name: string) => ({
    write: mockWrite,
    uri: `file:///documents/${name}`,
    name,
  }));
  const MockDirectory = jest.fn();
  return { File: MockFile, Directory: MockDirectory, Paths: { document: "file:///documents" } };
});

jest.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.0.0-test" } },
}));

jest.mock("expo-application", () => ({
  nativeBuildVersion: "42",
}));

jest.mock("@/db/helpers/progressSyncOutbox", () => ({
  getProgressSyncDiagnostics: () => mockGetProgressSyncDiagnostics(),
}));

import { writeDumpToDisk, pruneTraceDumps } from "@/lib/traceDump";
import * as ExpoFileSystem from "expo-file-system";

describe("writeDumpToDisk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProgressSyncDiagnostics.mockResolvedValue([
      {
        sessionId: "session-1",
        desiredRevision: 3,
        acknowledgedRevision: 2,
        attemptCount: 1,
        lastAttemptAt: null,
        nextAttemptAt: null,
        lastSuccessAt: null,
        hasError: true,
        terminalReason: null,
        updatedAt: new Date("2026-07-20T12:00:00.000Z"),
      },
    ]);
  });

  it("calls new File() with a filename matching /^trace-dump-.*\\.json$/", async () => {
    await writeDumpToDisk("manual");

    expect(ExpoFileSystem.File).toHaveBeenCalledTimes(1);
    const callArgs = (ExpoFileSystem.File as unknown as jest.Mock).mock.calls[0] as [
      unknown,
      string,
    ];
    const filename: string = callArgs[1];
    expect(filename).toMatch(/^trace-dump-.*\.json$/);
  });

  it("calls file.write() with a JSON string containing dumpReason: 'rejection'", async () => {
    await writeDumpToDisk("rejection");

    const MockFile = ExpoFileSystem.File as unknown as jest.Mock;
    const mockInstance = MockFile.mock.results[0].value as { write: jest.Mock };
    expect(mockInstance.write).toHaveBeenCalledTimes(1);

    const writeArg: string = mockInstance.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(writeArg) as Record<string, unknown>;
    expect(parsed.dumpReason).toBe("rejection");
  });

  it("returns the file URI string", async () => {
    const result = await writeDumpToDisk("manual");

    expect(typeof result).toBe("string");
    expect(result).toMatch(/^file:\/\//);
  });

  it("exported payload includes meta fields: appVersion, platform, dumpReason", async () => {
    await writeDumpToDisk("manual");

    const MockFile = ExpoFileSystem.File as unknown as jest.Mock;
    const mockInstance = MockFile.mock.results[0].value as { write: jest.Mock };
    const writeArg: string = mockInstance.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(writeArg) as Record<string, unknown>;

    expect(parsed).toHaveProperty("appVersion");
    expect(parsed).toHaveProperty("buildVersion");
    expect(parsed).toHaveProperty("platform");
    expect(parsed).toHaveProperty("dumpReason");
  });

  it("redacts identity fields from persisted progress outbox diagnostics and rejection metadata", async () => {
    await writeDumpToDisk("rejection", { sessionId: "session-1", deviceId: "device-1" });

    const MockFile = ExpoFileSystem.File as unknown as jest.Mock;
    const mockInstance = MockFile.mock.results[0].value as { write: jest.Mock };
    const writeArg: string = mockInstance.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(writeArg) as Record<string, unknown>;

    expect(parsed.progressSyncOutboxAvailable).toBe(true);
    expect(parsed.progressSyncOutbox).toEqual([
      expect.objectContaining({
        sessionId: "[REDACTED]",
        desiredRevision: 3,
        acknowledgedRevision: 2,
        attemptCount: 1,
        hasError: true,
      }),
    ]);
    expect(parsed.rejectionEvent).toEqual({ sessionId: "[REDACTED]", deviceId: "[REDACTED]" });
    expect(writeArg).not.toContain("session-1");
    expect(writeArg).not.toContain("device-1");
    expect(writeArg).not.toContain("network unavailable");
  });

  it("writes an unavailable marker without exposing diagnostic query errors", async () => {
    mockGetProgressSyncDiagnostics.mockRejectedValueOnce(
      new Error("sensitive database path /private/user.sqlite")
    );

    await expect(writeDumpToDisk("manual")).resolves.toMatch(/^file:\/\//);

    const MockFile = ExpoFileSystem.File as unknown as jest.Mock;
    const mockInstance = MockFile.mock.results[0].value as { write: jest.Mock };
    expect(mockInstance.write).toHaveBeenCalledTimes(1);
    const writeArg: string = mockInstance.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(writeArg) as Record<string, unknown>;

    expect(parsed.progressSyncOutboxAvailable).toBe(false);
    expect(parsed.progressSyncOutbox).toEqual([]);
    expect(writeArg).not.toContain("sensitive database path");
  });
});

// ─── pruneTraceDumps ──────────────────────────────────────────────────────────

/** Build a trace dump filename with a specific age in hours */
function makeDumpFileName(hoursAgo: number): string {
  const date = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const iso = date.toISOString().replace(/[:.]/g, "-");
  return `trace-dump-${iso}.json`;
}

/** Build a trace dump filename with a specific age in days */
function makeDumpFileNameDays(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const iso = date.toISOString().replace(/[:.]/g, "-");
  return `trace-dump-${iso}.json`;
}

/** Build a mock file object with controllable delete */
function makeDumpFile(name: string) {
  return { name, delete: jest.fn() };
}

type MockDumpFile = ReturnType<typeof makeDumpFile>;

function mockList(files: MockDumpFile[]): jest.Mock<() => Promise<MockDumpFile[]>> {
  return jest.fn<() => Promise<MockDumpFile[]>>().mockResolvedValue(files);
}

describe("pruneTraceDumps", () => {
  let MockDirectory: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    MockDirectory = ExpoFileSystem.Directory as unknown as jest.Mock;
  });

  it("handles an empty directory gracefully", async () => {
    MockDirectory.mockImplementation(() => ({ list: mockList([]) }));

    await expect(pruneTraceDumps()).resolves.not.toThrow();
  });

  it("does not delete any files when fewer than 30 recent dumps exist", async () => {
    // 5 files all within the last 5 hours (well within 7-day window)
    const files = Array.from({ length: 5 }, (_, i) => makeDumpFile(makeDumpFileName(i)));
    MockDirectory.mockImplementation(() => ({
      list: mockList(files),
    }));

    await pruneTraceDumps();

    files.forEach((f) => expect(f.delete).not.toHaveBeenCalled());
  });

  it("deletes oldest files beyond 30, keeping the 30 most recent", async () => {
    // 35 files spread over the last 35 hours (all within 7-day window)
    const files = Array.from({ length: 35 }, (_, i) => makeDumpFile(makeDumpFileName(i)));
    MockDirectory.mockImplementation(() => ({
      list: mockList(files),
    }));

    await pruneTraceDumps();

    // Files 0–29 (newest, hours 0–29) are kept
    files.slice(0, 30).forEach((f) => expect(f.delete).not.toHaveBeenCalled());
    // Files 30–34 (oldest, hours 30–34) are deleted
    files.slice(30).forEach((f) => expect(f.delete).toHaveBeenCalledTimes(1));
  });

  it("deletes trace dumps older than 7 days", async () => {
    const recentFile = makeDumpFile(makeDumpFileName(1)); // 1 hour ago
    const oldFile = makeDumpFile(makeDumpFileNameDays(10)); // 10 days ago — outside 7-day window

    MockDirectory.mockImplementation(() => ({
      list: mockList([recentFile, oldFile]),
    }));

    await pruneTraceDumps();

    // The recent dump remains while the expired dump is removed.
    expect(recentFile.delete).not.toHaveBeenCalled();
    expect(oldFile.delete).toHaveBeenCalledTimes(1);
  });

  it("ignores non-dump files in the directory", async () => {
    const dumpFile = makeDumpFile(makeDumpFileName(1));
    const otherFile = makeDumpFile("abs-logs-2026-03-25.txt");

    MockDirectory.mockImplementation(() => ({
      list: mockList([dumpFile, otherFile]),
    }));

    await pruneTraceDumps();

    expect(otherFile.delete).not.toHaveBeenCalled();
  });
});
