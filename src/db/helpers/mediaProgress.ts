import { db } from '@/db/client';
import { mediaProgress } from '@/db/schema/mediaProgress';
import type { ApiMediaProgress, ApiMeResponse, ApiUser } from '@/types/api';
import { and, desc, eq } from 'drizzle-orm';

export type NewMediaProgressRow = typeof mediaProgress.$inferInsert;
export type MediaProgressRow = typeof mediaProgress.$inferSelect;

// Extract array of media progress rows from an auth/me or login response
export function marshalMediaProgressFromAuthResponse(data: ApiMeResponse | ApiUser): NewMediaProgressRow[] {
  const userId = data.id;
  const list = data.mediaProgress ?? [];

  if (!userId || !Array.isArray(list) || list.length === 0) return [];

  return list.map((mp) => ({
    id: mp.id,
    userId,
    libraryItemId: mp.libraryItemId,
    episodeId: mp.episodeId ?? null,
    duration: mp.duration ?? null,
    progress: mp.progress ?? null,
    currentTime: mp.currentTime ?? null,
    isFinished: mp.isFinished ?? null,
    hideFromContinueListening: mp.hideFromContinueListening ?? null,
    lastUpdate: mp.lastUpdate ? new Date(mp.lastUpdate) : null,
    startedAt: mp.startedAt ? new Date(mp.startedAt) : null,
    finishedAt: mp.finishedAt ? new Date(mp.finishedAt) : null,
  }));
}

// Alternative function that accepts ApiMediaProgress array and userId directly
export function marshalMediaProgressFromArray(mediaProgressList: ApiMediaProgress[], userId: string): NewMediaProgressRow[] {
  if (!userId || !Array.isArray(mediaProgressList) || mediaProgressList.length === 0) return [];

  return mediaProgressList.map((mp) => ({
    id: mp.id,
    userId,
    libraryItemId: mp.libraryItemId,
    episodeId: mp.episodeId ?? null,
    duration: mp.duration ?? null,
    progress: mp.progress ?? null,
    currentTime: mp.currentTime ?? null,
    isFinished: mp.isFinished ?? null,
    hideFromContinueListening: mp.hideFromContinueListening ?? null,
    lastUpdate: mp.lastUpdate ? new Date(mp.lastUpdate) : null,
    startedAt: mp.startedAt ? new Date(mp.startedAt) : null,
    finishedAt: mp.finishedAt ? new Date(mp.finishedAt) : null,
  }));
}

export async function upsertMediaProgress(rows: NewMediaProgressRow[]): Promise<void> {
  if (!rows?.length) return;
  for (const row of rows) {
    await db
      .insert(mediaProgress)
      .values(row)
      .onConflictDoUpdate({ target: mediaProgress.id, set: row });
  }
}

// Get media progress for a specific library item and user
export async function getMediaProgressForLibraryItem(
  libraryItemId: string,
  userId: string
): Promise<MediaProgressRow | null> {
  const results = await db
    .select()
    .from(mediaProgress)
    .where(
      and(
        eq(mediaProgress.libraryItemId, libraryItemId),
        eq(mediaProgress.userId, userId)
      )
    )
    .orderBy(desc(mediaProgress.lastUpdate))
    .limit(1);

  return results[0] || null;
}
