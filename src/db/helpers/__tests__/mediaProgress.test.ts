/**
 * Tests for mediaProgress database helper functions
 *
 * Tests the batch query helper getMediaProgressForItems that returns
 * a Record<libraryItemId, MediaProgressRow> for batch progress lookups.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createTestDb, TestDatabase } from "../../../__tests__/utils/testDb";
import { mediaProgress } from "@/db/schema/mediaProgress";
import { users } from "@/db/schema/users";
import { libraries } from "@/db/schema/libraries";
import { libraryItems } from "@/db/schema/libraryItems";
import { getMediaProgressForItems } from "../mediaProgress";

// Stub data
const STUB_USER = {
  id: "user-1",
  username: "testuser",
  token: "test-token",
  email: "test@test.com",
  mediaProgress: [],
  serverAddress: "http://localhost:13378",
  isActive: true,
  isLocked: false,
  permissions: {},
  librariesAccessible: [],
  itemTagsAccessible: [],
};

const STUB_LIBRARY = {
  id: "lib-1",
  name: "Test Library",
  icon: null,
  displayOrder: 1,
  mediaType: "book" as const,
  createdAt: 1640995200000,
  updatedAt: 1672531200000,
};

const STUB_LIBRARY_ITEM_BASE = {
  libraryId: "lib-1",
  ino: null,
  folderId: null,
  path: null,
  relPath: null,
  isFile: false,
  mtimeMs: null,
  ctimeMs: null,
  birthtimeMs: null,
  addedAt: 1640995200000,
  updatedAt: 1672531200000,
  lastScan: null,
  scanVersion: null,
  isMissing: false,
  isInvalid: false,
  mediaType: "book" as const,
};

const makeProgressRow = (
  id: string,
  libraryItemId: string,
  userId: string,
  overrides: Record<string, unknown> = {}
) => ({
  id,
  userId,
  libraryItemId,
  episodeId: null,
  duration: 3600,
  progress: 0.5,
  currentTime: 1800,
  isFinished: false,
  hideFromContinueListening: false,
  lastUpdate: new Date("2024-01-01T12:00:00Z"),
  startedAt: new Date("2024-01-01T10:00:00Z"),
  finishedAt: null,
  ...overrides,
});

describe("mediaProgress DB helper — getMediaProgressForItems", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
    jest.doMock("@/db/client", () => ({ db: testDb.db }));

    // Insert prerequisite rows
    await testDb.db.insert(users).values(STUB_USER);
    await testDb.db.insert(libraries).values(STUB_LIBRARY);
    await testDb.db
      .insert(libraryItems)
      .values([
        { ...STUB_LIBRARY_ITEM_BASE, id: "item-1" },
        { ...STUB_LIBRARY_ITEM_BASE, id: "item-2" },
        { ...STUB_LIBRARY_ITEM_BASE, id: "item-3" },
      ]);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("getMediaProgressForItems returns empty record for empty input", async () => {
    const result = await getMediaProgressForItems([], "user-1");

    expect(result).toEqual({});
  });

  it("getMediaProgressForItems returns progress keyed by libraryItemId", async () => {
    await testDb.db.insert(mediaProgress).values([
      makeProgressRow("prog-1", "item-1", "user-1"),
      makeProgressRow("prog-2", "item-2", "user-1"),
    ]);

    const result = await getMediaProgressForItems(["item-1", "item-2"], "user-1");

    expect(Object.keys(result).sort()).toEqual(["item-1", "item-2"]);
    expect(result["item-1"].id).toBe("prog-1");
    expect(result["item-2"].id).toBe("prog-2");
    expect(result["item-1"].libraryItemId).toBe("item-1");
    expect(result["item-2"].libraryItemId).toBe("item-2");
  });

  it("getMediaProgressForItems deduplicates by keeping most recent row per item", async () => {
    // Insert two rows for item-1 — the most recent one should win
    await testDb.db.insert(mediaProgress).values([
      makeProgressRow("prog-old", "item-1", "user-1", {
        lastUpdate: new Date("2024-01-01T10:00:00Z"),
        progress: 0.2,
      }),
      makeProgressRow("prog-new", "item-1", "user-1", {
        lastUpdate: new Date("2024-01-02T10:00:00Z"),
        progress: 0.8,
      }),
    ]);

    const result = await getMediaProgressForItems(["item-1"], "user-1");

    expect(Object.keys(result)).toEqual(["item-1"]);
    // Most recent row should be returned
    expect(result["item-1"].id).toBe("prog-new");
    expect(result["item-1"].progress).toBe(0.8);
  });

  it("getMediaProgressForItems filters by userId", async () => {
    await testDb.db.insert(users).values({
      ...STUB_USER,
      id: "user-2",
      username: "otheruser",
      token: "other-token",
      email: "other@test.com",
    });
    await testDb.db.insert(mediaProgress).values([
      makeProgressRow("prog-u1", "item-1", "user-1", { progress: 0.5 }),
      makeProgressRow("prog-u2", "item-1", "user-2", { progress: 0.9 }),
    ]);

    const result = await getMediaProgressForItems(["item-1"], "user-1");

    expect(Object.keys(result)).toEqual(["item-1"]);
    expect(result["item-1"].userId).toBe("user-1");
    expect(result["item-1"].progress).toBe(0.5);
  });

  it("getMediaProgressForItems returns empty record when no matching items found", async () => {
    const result = await getMediaProgressForItems(["nonexistent-item"], "user-1");

    expect(result).toEqual({});
  });

  it("getMediaProgressForItems handles subset of items with no progress", async () => {
    await testDb.db.insert(mediaProgress).values([
      makeProgressRow("prog-1", "item-1", "user-1"),
    ]);

    const result = await getMediaProgressForItems(["item-1", "item-2", "item-3"], "user-1");

    // Only item-1 has progress
    expect(Object.keys(result)).toEqual(["item-1"]);
  });
});
