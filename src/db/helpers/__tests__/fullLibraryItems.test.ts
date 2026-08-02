/**
 * Tests for fullLibraryItems helper functions — batch upsert behavioral assertions
 *
 * These tests assert behavioral outcomes (row counts + data correctness),
 * not internal call counts. The behavioral contract proves the batch semantics
 * without coupling tests to implementation details.
 */

import { genres } from "@/db/schema/genres";
import { libraries } from "@/db/schema/libraries";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { narrators } from "@/db/schema/narrators";
import { series } from "@/db/schema/series";
import { tags } from "@/db/schema/tags";
import type { ApiLibraryItem } from "@/types/api";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mockBook, mockBookLibraryItem } from "../../../__tests__/fixtures";
import { createTestDb, TestDatabase } from "../../../__tests__/utils/testDb";
import { upsertGenres, upsertNarrators, upsertTags } from "../fullLibraryItems";

describe("FullLibraryItems Helper — top-level batch helpers", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe("Database Operations", () => {
    beforeEach(() => {
      jest.doMock("@/db/client", () => ({ db: testDb.db }));
    });

    describe("upsertGenres", () => {
      it("should insert 3 genre rows from a single call", async () => {
        await upsertGenres(["Fantasy", "Sci-Fi", "Mystery"]);

        const all = await testDb.db.select().from(genres);
        expect(all).toHaveLength(3);
        expect(all.map((r) => r.name).sort()).toEqual(["Fantasy", "Mystery", "Sci-Fi"]);
      });

      it("should resolve without error for empty array", async () => {
        await expect(upsertGenres([])).resolves.not.toThrow();

        const all = await testDb.db.select().from(genres);
        expect(all).toHaveLength(0);
      });

      it("should not throw and not duplicate rows on overlapping names (onConflictDoNothing)", async () => {
        await upsertGenres(["Fantasy", "Sci-Fi"]);
        await upsertGenres(["Sci-Fi", "Mystery"]); // Sci-Fi already exists

        const all = await testDb.db.select().from(genres);
        expect(all).toHaveLength(3); // No duplicates
        expect(all.map((r) => r.name).sort()).toEqual(["Fantasy", "Mystery", "Sci-Fi"]);
      });

      it("should resolve without error for null input", async () => {
        await expect(upsertGenres(null as any)).resolves.not.toThrow();
      });
    });

    describe("upsertNarrators", () => {
      it("should insert 2 narrator rows from a single call", async () => {
        await upsertNarrators(["Alice", "Bob"]);

        const all = await testDb.db.select().from(narrators);
        expect(all).toHaveLength(2);
        expect(all.map((r) => r.name).sort()).toEqual(["Alice", "Bob"]);
      });

      it("should resolve without error for empty array", async () => {
        await expect(upsertNarrators([])).resolves.not.toThrow();

        const all = await testDb.db.select().from(narrators);
        expect(all).toHaveLength(0);
      });

      it("should not throw and not duplicate rows on overlapping names", async () => {
        await upsertNarrators(["Alice", "Bob"]);
        await upsertNarrators(["Bob", "Charlie"]); // Bob already exists

        const all = await testDb.db.select().from(narrators);
        expect(all).toHaveLength(3); // No duplicates
        expect(all.map((r) => r.name).sort()).toEqual(["Alice", "Bob", "Charlie"]);
      });

      it("should resolve without error for null input", async () => {
        await expect(upsertNarrators(null as any)).resolves.not.toThrow();
      });
    });

    describe("upsertTags", () => {
      it("should insert 2 tag rows from a single call", async () => {
        await upsertTags(["tag1", "tag2"]);

        const all = await testDb.db.select().from(tags);
        expect(all).toHaveLength(2);
        expect(all.map((r) => r.name).sort()).toEqual(["tag1", "tag2"]);
      });

      it("should resolve without error for empty array", async () => {
        await expect(upsertTags([])).resolves.not.toThrow();

        const all = await testDb.db.select().from(tags);
        expect(all).toHaveLength(0);
      });

      it("should not throw and not duplicate rows on overlapping names", async () => {
        await upsertTags(["tag1", "tag2"]);
        await upsertTags(["tag2", "tag3"]); // tag2 already exists

        const all = await testDb.db.select().from(tags);
        expect(all).toHaveLength(3); // No duplicates
        expect(all.map((r) => r.name).sort()).toEqual(["tag1", "tag2", "tag3"]);
      });

      it("should resolve without error for null input", async () => {
        await expect(upsertTags(null as any)).resolves.not.toThrow();
      });
    });
  });

  /**
   * Regression coverage for the Series tab under-counting bug: a single item
   * failing to process (e.g. a transient DB/FK error) used to make
   * processFullLibraryItems() bail out via an early `return`, silently
   * dropping every subsequent item in the batch. Since nothing else in the
   * app ever revisits those items, they were permanently stuck with only
   * minified data — missing their series/author links — which is exactly
   * what produced the under-reported series book counts.
   */
  describe("processFullLibraryItems — batch resilience", () => {
    beforeEach(() => {
      jest.doMock("@/db/client", () => ({ db: testDb.db }));
    });

    function makeItem(id: string, libraryId: string, title: string): ApiLibraryItem {
      return {
        ...mockBookLibraryItem,
        id,
        libraryId,
        media: {
          ...mockBook,
          id: `media-${id}`,
          libraryItemId: id,
          metadata: { ...mockBook.metadata, title },
        },
      };
    }

    it("continues processing later items after an earlier item fails", async () => {
      const { processFullLibraryItems } = require("../fullLibraryItems");

      // Only "lib-1" exists — an item referencing a non-existent library
      // fails its FOREIGN KEY constraint on insert, mimicking a real
      // transient per-item failure.
      await testDb.db.insert(libraries).values({ id: "lib-1", name: "Test Library" });

      const good1 = makeItem("li-good-1", "lib-1", "Good Book 1");
      const bad = makeItem("li-bad", "lib-does-not-exist", "Bad Book");
      const good2 = makeItem("li-good-2", "lib-1", "Good Book 2");

      await processFullLibraryItems([good1, bad, good2]);

      const rows = await testDb.db.select().from(mediaMetadata);
      const titles = rows.map((r) => r.title).sort();

      // The item after the failing one must still have been processed.
      expect(titles).toEqual(["Good Book 1", "Good Book 2"]);
    });

    it("still links series data for items after a failed item in the same batch", async () => {
      const { processFullLibraryItems } = require("../fullLibraryItems");

      await testDb.db.insert(libraries).values({ id: "lib-1", name: "Test Library" });

      const bad = makeItem("li-bad", "lib-does-not-exist", "Bad Book");
      const good = makeItem("li-good", "lib-1", "Good Book");

      await processFullLibraryItems([bad, good]);

      const seriesRows = await testDb.db.select().from(series);
      expect(seriesRows.map((r) => r.name)).toEqual(["Classic Literature"]);
    });
  });
});
