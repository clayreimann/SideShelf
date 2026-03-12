/**
 * Tests for bookmarks database helper functions
 *
 * Tests upsertBookmark, getBookmarksByItem, deleteBookmarkLocal,
 * enqueuePendingOp, dequeuePendingOps, clearPendingOps, and upsertAllBookmarks.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createTestDb, TestDatabase } from "../../../__tests__/utils/testDb";
import { bookmarks, pendingBookmarkOps } from "@/db/schema/bookmarks";
import { users } from "@/db/schema/users";
import type { ApiAudioBookmark } from "@/types/api";
import {
  clearPendingOps,
  deleteBookmarkLocal,
  dequeuePendingOps,
  enqueuePendingOp,
  getBookmarksByItem,
  upsertAllBookmarks,
  upsertBookmark,
} from "../bookmarks";

const STUB_USER = {
  id: "user-1",
  username: "testuser",
};

const STUB_USER_2 = {
  id: "user-2",
  username: "testuser2",
};

const makeBookmarkRow = (overrides: Partial<typeof bookmarks.$inferInsert> = {}) => ({
  id: "bookmark-1",
  userId: "user-1",
  libraryItemId: "item-1",
  title: "My Bookmark",
  time: 120.5,
  createdAt: new Date("2024-01-01T10:00:00Z"),
  syncedAt: null,
  ...overrides,
});

const makePendingOp = (overrides: Partial<typeof pendingBookmarkOps.$inferInsert> = {}) => ({
  id: "op-1",
  userId: "user-1",
  libraryItemId: "item-1",
  operationType: "create" as const,
  bookmarkId: "bookmark-1",
  time: 120.5,
  title: "My Bookmark",
  createdAt: new Date("2024-01-01T10:00:00Z"),
  ...overrides,
});

describe("bookmarks DB helpers", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
    jest.doMock("@/db/client", () => ({ db: testDb.db }));

    // Insert prerequisite rows
    await testDb.db.insert(users).values(STUB_USER);
    await testDb.db.insert(users).values(STUB_USER_2);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe("upsertBookmark", () => {
    it("writes a new bookmark row", async () => {
      await upsertBookmark(makeBookmarkRow());

      const rows = await testDb.db.select().from(bookmarks);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("bookmark-1");
      expect(rows[0].title).toBe("My Bookmark");
      expect(rows[0].time).toBe(120.5);
    });

    it("updates title, time, and syncedAt on second call with same id", async () => {
      await upsertBookmark(makeBookmarkRow());

      const syncedAt = new Date("2024-01-02T10:00:00Z");
      await upsertBookmark(makeBookmarkRow({ title: "Updated Title", time: 200.0, syncedAt }));

      const rows = await testDb.db.select().from(bookmarks);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Updated Title");
      expect(rows[0].time).toBe(200.0);
      expect(rows[0].syncedAt).toEqual(syncedAt);
    });
  });

  describe("getBookmarksByItem", () => {
    it("returns rows for matching userId+libraryItemId sorted by time ascending", async () => {
      await testDb.db
        .insert(bookmarks)
        .values([
          makeBookmarkRow({ id: "b-2", time: 300.0, title: "Later" }),
          makeBookmarkRow({ id: "b-1", time: 100.0, title: "Earlier" }),
          makeBookmarkRow({ id: "b-3", time: 200.0, title: "Middle" }),
        ]);

      const rows = await getBookmarksByItem("user-1", "item-1");
      expect(rows).toHaveLength(3);
      expect(rows[0].id).toBe("b-1");
      expect(rows[1].id).toBe("b-3");
      expect(rows[2].id).toBe("b-2");
    });

    it("returns empty array when no rows match", async () => {
      const rows = await getBookmarksByItem("user-1", "item-nonexistent");
      expect(rows).toEqual([]);
    });

    it("does not return rows for a different userId", async () => {
      await testDb.db
        .insert(bookmarks)
        .values(makeBookmarkRow({ id: "b-other", userId: "user-2" }));

      const rows = await getBookmarksByItem("user-1", "item-1");
      expect(rows).toEqual([]);
    });
  });

  describe("deleteBookmarkLocal", () => {
    it("deletes the row matching userId+libraryItemId+time", async () => {
      await testDb.db
        .insert(bookmarks)
        .values([
          makeBookmarkRow({ id: "b-1", time: 100.0 }),
          makeBookmarkRow({ id: "b-2", time: 200.0 }),
        ]);

      await deleteBookmarkLocal("user-1", "item-1", 100.0);

      const rows = await testDb.db.select().from(bookmarks);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("b-2");
    });

    it("does not delete a non-matching row", async () => {
      await testDb.db.insert(bookmarks).values(makeBookmarkRow({ time: 100.0 }));

      await deleteBookmarkLocal("user-1", "item-1", 999.0);

      const rows = await testDb.db.select().from(bookmarks);
      expect(rows).toHaveLength(1);
    });
  });

  describe("enqueuePendingOp", () => {
    it("writes a pending_bookmark_ops row", async () => {
      await enqueuePendingOp(makePendingOp());

      const rows = await testDb.db.select().from(pendingBookmarkOps);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("op-1");
      expect(rows[0].operationType).toBe("create");
    });
  });

  describe("dequeuePendingOps", () => {
    it("returns all rows for userId in createdAt ascending order (FIFO)", async () => {
      await testDb.db.insert(pendingBookmarkOps).values([
        makePendingOp({
          id: "op-2",
          createdAt: new Date("2024-01-01T12:00:00Z"),
        }),
        makePendingOp({
          id: "op-1",
          createdAt: new Date("2024-01-01T10:00:00Z"),
        }),
        makePendingOp({
          id: "op-3",
          createdAt: new Date("2024-01-01T14:00:00Z"),
        }),
      ]);

      const rows = await dequeuePendingOps("user-1");
      expect(rows).toHaveLength(3);
      expect(rows[0].id).toBe("op-1");
      expect(rows[1].id).toBe("op-2");
      expect(rows[2].id).toBe("op-3");
    });

    it("returns only rows for the given userId", async () => {
      await testDb.db
        .insert(pendingBookmarkOps)
        .values([
          makePendingOp({ id: "op-u1", userId: "user-1" }),
          makePendingOp({ id: "op-u2", userId: "user-2" }),
        ]);

      const rows = await dequeuePendingOps("user-1");
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("op-u1");
    });
  });

  describe("clearPendingOps", () => {
    it("deletes all rows for userId with matching ids", async () => {
      await testDb.db
        .insert(pendingBookmarkOps)
        .values([
          makePendingOp({ id: "op-1" }),
          makePendingOp({ id: "op-2" }),
          makePendingOp({ id: "op-3" }),
        ]);

      await clearPendingOps("user-1", ["op-1", "op-2"]);

      const rows = await testDb.db.select().from(pendingBookmarkOps);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("op-3");
    });

    it("does not delete rows for a different userId even if ids match", async () => {
      await testDb.db
        .insert(pendingBookmarkOps)
        .values([
          makePendingOp({ id: "op-1", userId: "user-1" }),
          makePendingOp({ id: "op-2", userId: "user-2" }),
        ]);

      // Clear op-2 for user-1 — but op-2 belongs to user-2, should be untouched
      await clearPendingOps("user-1", ["op-2"]);

      const rows = await testDb.db.select().from(pendingBookmarkOps);
      expect(rows).toHaveLength(2);
    });
  });

  describe("upsertAllBookmarks", () => {
    it("writes all rows from ApiAudioBookmark array", async () => {
      const apiBookmarks: ApiAudioBookmark[] = [
        {
          id: "bm-1",
          libraryItemId: "item-1",
          title: "Chapter 1",
          time: 60.0,
          createdAt: 1704067200000,
        },
        {
          id: "bm-2",
          libraryItemId: "item-1",
          title: "Chapter 2",
          time: 180.0,
          createdAt: 1704153600000,
        },
      ];

      await upsertAllBookmarks("user-1", apiBookmarks);

      const rows = await testDb.db.select().from(bookmarks);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id).sort()).toEqual(["bm-1", "bm-2"]);
    });

    it("handles empty array without errors", async () => {
      await upsertAllBookmarks("user-1", []);

      const rows = await testDb.db.select().from(bookmarks);
      expect(rows).toHaveLength(0);
    });
  });
});
