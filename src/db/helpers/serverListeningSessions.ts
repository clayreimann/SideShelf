/**
 * Server Listening Sessions Database Helpers
 *
 * Helpers for managing cached server listening sessions.
 * These sessions are fetched from /api/me/listening-sessions and cached locally
 * to reduce API calls and provide session history.
 */

import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "../client";
import {
  serverListeningSessions,
  type NewServerListeningSessionRow,
  type ServerListeningSessionRow,
} from "../schema/localData";
import type { ApiListeningSession } from "@/types/session";

/**
 * Upsert server sessions (batch insert/update)
 * @param sessions - Array of sessions from server API
 */
export async function upsertServerSessions(sessions: ApiListeningSession[]): Promise<void> {
  if (sessions.length === 0) {
    return;
  }

  const rows: NewServerListeningSessionRow[] = sessions.map((session) => ({
    id: session.id,
    userId: session.userId,
    libraryItemId: session.libraryItemId,
    libraryId: session.libraryId,
    episodeId: session.episodeId,
    mediaType: session.mediaType,
    displayTitle: session.displayTitle,
    displayAuthor: session.displayAuthor,
    coverPath: session.coverPath,
    duration: session.duration,
    playMethod: session.playMethod,
    mediaPlayer: session.mediaPlayer,
    startTime: session.startTime,
    currentTime: session.currentTime,
    timeListening: session.timeListening,
    startedAt: new Date(session.startedAt),
    updatedAt: new Date(session.updatedAt),
    dayOfWeek: session.dayOfWeek,
    date: session.date,
    fetchedAt: new Date(),
  }));

  // Use onConflictDoUpdate for upsert behavior
  await db
    .insert(serverListeningSessions)
    .values(rows)
    .onConflictDoUpdate({
      target: serverListeningSessions.id,
      set: {
        currentTime: rows[0].currentTime, // Will be overwritten for each row
        updatedAt: rows[0].updatedAt,
        timeListening: rows[0].timeListening,
        fetchedAt: new Date(),
      },
    })
    .run();
}

/**
 * Get cached server sessions for a specific library item
 * @param libraryItemId - Library item ID to filter by
 * @param userId - User ID
 * @param limit - Maximum number of sessions to return
 * @returns Array of server sessions sorted by updatedAt DESC
 */
export async function getServerSessionsForItem(
  libraryItemId: string,
  userId: string,
  limit: number = 20
): Promise<ServerListeningSessionRow[]> {
  return db
    .select()
    .from(serverListeningSessions)
    .where(
      and(
        eq(serverListeningSessions.libraryItemId, libraryItemId),
        eq(serverListeningSessions.userId, userId)
      )
    )
    .orderBy(desc(serverListeningSessions.updatedAt))
    .limit(limit)
    .all();
}

/**
 * Get all cached server sessions for a user
 * @param userId - User ID
 * @param limit - Maximum number of sessions to return
 * @returns Array of server sessions sorted by updatedAt DESC
 */
export async function getServerSessionsForUser(
  userId: string,
  limit: number = 100
): Promise<ServerListeningSessionRow[]> {
  return db
    .select()
    .from(serverListeningSessions)
    .where(eq(serverListeningSessions.userId, userId))
    .orderBy(desc(serverListeningSessions.updatedAt))
    .limit(limit)
    .all();
}

/**
 * Get the timestamp of when server sessions were last fetched for a user
 * Returns the most recent fetchedAt timestamp
 * @param userId - User ID
 * @returns Date of last fetch, or null if never fetched
 */
export async function getLastSessionFetchTime(userId: string): Promise<Date | null> {
  const result = await db
    .select({ fetchedAt: serverListeningSessions.fetchedAt })
    .from(serverListeningSessions)
    .where(eq(serverListeningSessions.userId, userId))
    .orderBy(desc(serverListeningSessions.fetchedAt))
    .limit(1)
    .get();

  return result?.fetchedAt || null;
}

/**
 * Delete old server sessions (cleanup)
 * @param olderThan - Delete sessions fetched before this date
 * @returns Number of sessions deleted
 */
export async function deleteOldServerSessions(olderThan: Date): Promise<number> {
  const result = await db
    .delete(serverListeningSessions)
    .where(gt(serverListeningSessions.fetchedAt, olderThan))
    .run();

  return result.changes;
}

/**
 * Delete all server sessions for a user
 * Useful for logout or clearing cache
 * @param userId - User ID
 * @returns Number of sessions deleted
 */
export async function deleteServerSessionsForUser(userId: string): Promise<number> {
  const result = await db
    .delete(serverListeningSessions)
    .where(eq(serverListeningSessions.userId, userId))
    .run();

  return result.changes;
}

/**
 * Get the most recently updated server session for an item
 * @param libraryItemId - Library item ID
 * @param userId - User ID
 * @returns Most recent session or null
 */
export async function getMostRecentServerSession(
  libraryItemId: string,
  userId: string
): Promise<ServerListeningSessionRow | null> {
  return (
    db
      .select()
      .from(serverListeningSessions)
      .where(
        and(
          eq(serverListeningSessions.libraryItemId, libraryItemId),
          eq(serverListeningSessions.userId, userId)
        )
      )
      .orderBy(desc(serverListeningSessions.updatedAt))
      .limit(1)
      .get() || null
  );
}
