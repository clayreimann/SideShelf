/**
 * Tests for writeDumpToDisk
 *
 * RED stubs — all tests reference @/lib/traceDump which does not exist yet.
 * These tests will fail until traceDump.ts is implemented.
 *
 * Note: @/lib/trace mock uses virtual:true because trace.ts does not exist yet.
 * The expo-application mock uses virtual:true because the package is not yet installed.
 * Both will be replaced with real imports once implementation plans run.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// expo-file-system IS installed — mock its File API
jest.mock("expo-file-system", () => {
  const { jest } = require("@jest/globals");
  const mockWrite = jest.fn().mockResolvedValue(undefined);
  const MockFile = jest.fn().mockImplementation((_dir: unknown, name: string) => ({
    write: mockWrite,
    uri: `file:///documents/${name}`,
    name,
  }));
  return { File: MockFile, Paths: { document: "file:///documents" } };
});

// expo-application is not yet installed — virtual mock provides the shape
jest.mock(
  "expo-application",
  () => ({ nativeApplicationVersion: "1.0.0-test" }),
  { virtual: true }
);

// @/lib/traceDump is the module under test — it does not exist yet.
// This import will throw "Cannot find module" until Plan 02 implements it.
import { writeDumpToDisk } from "@/lib/traceDump";
import * as ExpoFileSystem from "expo-file-system";

describe("writeDumpToDisk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls new File() with a filename matching /^trace-dump-.*\\.json$/", async () => {
    await writeDumpToDisk("manual");

    expect(ExpoFileSystem.File).toHaveBeenCalledTimes(1);
    const callArgs = (ExpoFileSystem.File as jest.Mock).mock.calls[0] as [unknown, string];
    const filename: string = callArgs[1];
    expect(filename).toMatch(/^trace-dump-.*\.json$/);
  });

  it("calls file.write() with a JSON string containing dumpReason: 'rejection'", async () => {
    await writeDumpToDisk("rejection");

    const MockFile = ExpoFileSystem.File as jest.Mock;
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

    const MockFile = ExpoFileSystem.File as jest.Mock;
    const mockInstance = MockFile.mock.results[0].value as { write: jest.Mock };
    const writeArg: string = mockInstance.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(writeArg) as Record<string, unknown>;

    expect(parsed).toHaveProperty("appVersion");
    expect(parsed).toHaveProperty("platform");
    expect(parsed).toHaveProperty("dumpReason");
  });
});
