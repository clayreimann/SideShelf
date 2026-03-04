/**
 * Tests for fullLibraryItems helper functions — batch upsert behavioral assertions
 *
 * These tests assert behavioral outcomes (row counts + data correctness),
 * not internal call counts. The behavioral contract proves the batch semantics
 * without coupling tests to implementation details.
 */

import { genres } from "@/db/schema/genres";
import { narrators } from "@/db/schema/narrators";
import { tags } from "@/db/schema/tags";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
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
});
