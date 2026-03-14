import { db } from "@/db/client";
import {
  bookmarks,
  BookmarkRow,
  pendingBookmarkOps,
  PendingBookmarkOpRow,
} from "@/db/schema/bookmarks";
import type { ApiAudioBookmark } from "@/types/api";
import { and, asc, eq, inArray } from "drizzle-orm";

function buildBookmarkId(item: Pick<ApiAudioBookmark, "libraryItemId" | "time" | "title">): string {
  return `${item.libraryItemId}:${item.time}:${item.title}`;
}

function normalizeBookmarkId(item: ApiAudioBookmark): string {
  return item.id || buildBookmarkId(item);
}

/**
 * Upsert a single bookmark row.
 * On conflict (same id), updates title, time, and syncedAt.
 */
export async function upsertBookmark(row: typeof bookmarks.$inferInsert): Promise<void> {
  await db
    .insert(bookmarks)
    .values(row)
    .onConflictDoUpdate({
      target: bookmarks.id,
      set: {
        title: row.title,
        time: row.time,
        syncedAt: row.syncedAt,
      },
    });
}

/**
 * Bulk upsert bookmarks from ABS API response.
 * Maps ApiAudioBookmark fields to schema row format.
 */
export async function upsertAllBookmarks(userId: string, items: ApiAudioBookmark[]): Promise<void> {
  if (!items.length) return;

  for (const item of items) {
    await upsertBookmark({
      id: normalizeBookmarkId(item),
      userId,
      libraryItemId: item.libraryItemId,
      title: item.title,
      time: item.time,
      createdAt: new Date(item.createdAt),
      syncedAt: new Date(),
    });
  }
}

/**
 * Get all bookmarks for a specific user + library item, sorted by time ascending.
 */
export async function getBookmarksByItem(
  userId: string,
  libraryItemId: string
): Promise<BookmarkRow[]> {
  return db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.libraryItemId, libraryItemId)))
    .orderBy(asc(bookmarks.time));
}

/**
 * Delete a bookmark by userId + libraryItemId + time.
 * Used for optimistic deletes before the server confirms.
 */
export async function deleteBookmarkLocal(
  userId: string,
  libraryItemId: string,
  time: number
): Promise<void> {
  await db
    .delete(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.libraryItemId, libraryItemId),
        eq(bookmarks.time, time)
      )
    );
}

/**
 * Enqueue a pending bookmark operation for later sync.
 */
export async function enqueuePendingOp(op: typeof pendingBookmarkOps.$inferInsert): Promise<void> {
  await db.insert(pendingBookmarkOps).values(op);
}

/**
 * Dequeue all pending ops for a user in FIFO order (createdAt ascending).
 */
export async function dequeuePendingOps(userId: string): Promise<PendingBookmarkOpRow[]> {
  return db
    .select()
    .from(pendingBookmarkOps)
    .where(eq(pendingBookmarkOps.userId, userId))
    .orderBy(asc(pendingBookmarkOps.createdAt));
}

/**
 * Clear specific pending ops after successful sync.
 * Only clears ops matching both userId and the provided ids.
 */
export async function clearPendingOps(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;

  await db
    .delete(pendingBookmarkOps)
    .where(and(eq(pendingBookmarkOps.userId, userId), inArray(pendingBookmarkOps.id, ids)));
}
