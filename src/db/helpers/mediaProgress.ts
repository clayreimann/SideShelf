import { db } from '@/db/client';
import { mediaProgress } from '@/db/schema/mediaProgress';
import { LoginResponse, MediaProgress, MeResponse } from '@/lib/api/types';

export type NewMediaProgressRow = typeof mediaProgress.$inferInsert;

// Extract array of media progress rows from an auth/me or login response
export function marshalMediaProgressFromAuthResponse(data: MeResponse | LoginResponse): NewMediaProgressRow[] {
  const userId = data.user?.id;
  const list = data.user?.mediaProgress ?? [];

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

// Alternative function that accepts MediaProgress array and userId directly
export function marshalMediaProgressFromArray(mediaProgressList: MediaProgress[], userId: string): NewMediaProgressRow[] {
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
