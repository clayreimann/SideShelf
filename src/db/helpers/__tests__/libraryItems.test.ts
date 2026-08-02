/**
 * Tests for libraryItems database helper functions — batch upsert behavioral assertions
 */

import { authors } from "@/db/schema/authors";
import { audioFiles } from "@/db/schema/audioFiles";
import { libraries } from "@/db/schema/libraries";
import { libraryItems } from "@/db/schema/libraryItems";
import { mediaAuthors } from "@/db/schema/mediaJoins";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import type { NewLibraryItemRow } from "@/types/database";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createTestDb, TestDatabase } from "../../../__tests__/utils/testDb";
import { getLibraryItemsNeedingRefresh, upsertLibraryItems } from "../libraryItems";

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

    /**
     * Regression coverage for the Series tab under-counting bug: this query
     * is what the app's self-healing backfill uses to find items whose
     * background full-detail sync never completed (e.g. interrupted by an
     * app reload) so they can be reprocessed — without it, an item stuck
     * with only minified data (no author/series links) stays stuck forever.
     */
    describe("getLibraryItemsNeedingRefresh", () => {
      it("flags an item that has no media_metadata row at all", async () => {
        await testDb.db.insert(libraryItems).values(makeLibraryItemRow({ id: "item-minified" }));

        const needing = await getLibraryItemsNeedingRefresh();

        expect(needing).toEqual(["item-minified"]);
      });

      it("flags an item with metadata but no linked authors or audio files", async () => {
        await testDb.db.insert(libraryItems).values(makeLibraryItemRow({ id: "item-partial" }));
        await testDb.db.insert(mediaMetadata).values({
          id: "media-partial",
          libraryItemId: "item-partial",
          mediaType: "book",
          title: "Partial Book",
        });

        const needing = await getLibraryItemsNeedingRefresh();

        expect(needing).toEqual(["item-partial"]);
      });

      it("does not flag an item that has metadata, authors, and audio files", async () => {
        await testDb.db.insert(libraryItems).values(makeLibraryItemRow({ id: "item-complete" }));
        await testDb.db.insert(mediaMetadata).values({
          id: "media-complete",
          libraryItemId: "item-complete",
          mediaType: "book",
          title: "Complete Book",
        });
        await testDb.db.insert(authors).values({ id: "author-1", name: "Some Author" });
        await testDb.db
          .insert(mediaAuthors)
          .values({ mediaId: "media-complete", authorId: "author-1" });
        await testDb.db.insert(audioFiles).values({
          id: "media-complete_1",
          mediaId: "media-complete",
          index: 1,
          ino: "1",
          filename: "track01.mp3",
          path: "/audiobooks/track01.mp3",
        });

        const needing = await getLibraryItemsNeedingRefresh();

        expect(needing).toEqual([]);
      });

      it("returns a mix of complete and incomplete items correctly, respecting the limit", async () => {
        await testDb.db
          .insert(libraryItems)
          .values([
            makeLibraryItemRow({ id: "item-complete" }),
            makeLibraryItemRow({ id: "item-partial" }),
          ]);
        await testDb.db.insert(mediaMetadata).values([
          { id: "media-complete", libraryItemId: "item-complete", mediaType: "book", title: "A" },
          { id: "media-partial", libraryItemId: "item-partial", mediaType: "book", title: "B" },
        ]);
        await testDb.db.insert(authors).values({ id: "author-1", name: "Some Author" });
        await testDb.db
          .insert(mediaAuthors)
          .values({ mediaId: "media-complete", authorId: "author-1" });
        await testDb.db.insert(audioFiles).values({
          id: "media-complete_1",
          mediaId: "media-complete",
          index: 1,
          ino: "1",
          filename: "track01.mp3",
          path: "/audiobooks/track01.mp3",
        });

        const needing = await getLibraryItemsNeedingRefresh(10);

        expect(needing).toEqual(["item-partial"]);
      });

      it("is not crowded out by a fully-synced item with many audio files/authors (JOIN fan-out)", async () => {
        // A completed multi-file audiobook with several authors and audio
        // files used to fan out into one row per author x audio-file
        // combination via the old LEFT JOIN implementation, which could
        // exhaust the query's row window before the genuinely incomplete
        // item was ever reached.
        await testDb.db
          .insert(libraryItems)
          .values([
            makeLibraryItemRow({ id: "item-complete" }),
            makeLibraryItemRow({ id: "item-partial" }),
          ]);
        await testDb.db.insert(mediaMetadata).values([
          { id: "media-complete", libraryItemId: "item-complete", mediaType: "book", title: "A" },
          { id: "media-partial", libraryItemId: "item-partial", mediaType: "book", title: "B" },
        ]);
        await testDb.db.insert(authors).values([
          { id: "author-1", name: "Author One" },
          { id: "author-2", name: "Author Two" },
        ]);
        await testDb.db.insert(mediaAuthors).values([
          { mediaId: "media-complete", authorId: "author-1" },
          { mediaId: "media-complete", authorId: "author-2" },
        ]);
        await testDb.db.insert(audioFiles).values(
          Array.from({ length: 8 }, (_, i) => ({
            id: `media-complete_${i + 1}`,
            mediaId: "media-complete",
            index: i + 1,
            ino: String(i + 1),
            filename: `track${i + 1}.mp3`,
            path: `/audiobooks/track${i + 1}.mp3`,
          }))
        );

        const needing = await getLibraryItemsNeedingRefresh(1);

        expect(needing).toEqual(["item-partial"]);
      });
    });
  });
});
