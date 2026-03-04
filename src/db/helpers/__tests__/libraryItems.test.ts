/**
 * Tests for libraryItems database helper functions — batch upsert behavioral assertions
 */

import { libraries } from "@/db/schema/libraries";
import { libraryItems } from "@/db/schema/libraryItems";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createTestDb, TestDatabase } from "../../../__tests__/utils/testDb";
import { upsertLibraryItems, type NewLibraryItemRow } from "../libraryItems";

/** Stub library required for FK constraint on library_items.library_id */
const STUB_LIBRARY = {
  id: "lib-test",
  name: "Test Library",
  icon: null,
  displayOrder: 1,
  mediaType: "book" as const,
  createdAt: 1640995200000,
  updatedAt: 1672531200000,
};

function makeLibraryItemRow(
  overrides: Partial<NewLibraryItemRow> & { id: string }
): NewLibraryItemRow {
  return {
    libraryId: "lib-test",
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
    mediaType: "book",
    ...overrides,
  };
}

describe("LibraryItems Helper", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
    // Insert stub library to satisfy FK constraint
    await testDb.db.insert(libraries).values(STUB_LIBRARY);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe("Database Operations", () => {
    beforeEach(() => {
      jest.doMock("@/db/client", () => ({ db: testDb.db }));
    });

    describe("upsertLibraryItems — batch insert", () => {
      it("should insert 3 rows and result in exactly 3 rows in the DB", async () => {
        const rows = [
          makeLibraryItemRow({ id: "item-1" }),
          makeLibraryItemRow({ id: "item-2" }),
          makeLibraryItemRow({ id: "item-3" }),
        ];

        await upsertLibraryItems(rows);

        const all = await testDb.db.select().from(libraryItems);
        expect(all).toHaveLength(3);
        expect(all.map((r) => r.id).sort()).toEqual(["item-1", "item-2", "item-3"]);
      });

      it("should resolve without error and insert nothing for empty array", async () => {
        await expect(upsertLibraryItems([])).resolves.not.toThrow();

        const all = await testDb.db.select().from(libraryItems);
        expect(all).toHaveLength(0);
      });

      it("should be idempotent — calling twice with same IDs updates, not duplicates", async () => {
        const rows = [
          makeLibraryItemRow({ id: "item-dup", path: "/original" }),
          makeLibraryItemRow({ id: "item-dup2", path: "/original2" }),
        ];

        await upsertLibraryItems(rows);

        // Second upsert with updated data
        const updatedRows = [
          makeLibraryItemRow({ id: "item-dup", path: "/updated" }),
          makeLibraryItemRow({ id: "item-dup2", path: "/updated2" }),
        ];
        await upsertLibraryItems(updatedRows);

        const all = await testDb.db.select().from(libraryItems);
        expect(all).toHaveLength(2);
        expect(all.find((r) => r.id === "item-dup")?.path).toBe("/updated");
        expect(all.find((r) => r.id === "item-dup2")?.path).toBe("/updated2");
      });

      it("should resolve without error for null input", async () => {
        await expect(upsertLibraryItems(null as any)).resolves.not.toThrow();
      });
    });
  });
});
