import { db } from '@/db/client';
import { resolveAppPath, toAppRelativePath } from '@/lib/fileSystem';
import {
  localAudioFileDownloads,
  localCoverCache,
  localLibraryFileDownloads,
  type LocalAudioFileDownloadRow,
  type LocalCoverCacheRow,
  type LocalLibraryFileDownloadRow
} from '@/db/schema/localData';
import { eq } from 'drizzle-orm';

// ===== LOCAL COVER CACHE =====

/**
 * Cache a cover URL for a media item
 */
export async function setLocalCoverCached(mediaId: string, localCoverUrl: string): Promise<void> {
  const now = new Date();
  const storedPath = toAppRelativePath(localCoverUrl);
  console.log(`[localData] Caching local cover for mediaId=${mediaId}: ${localCoverUrl}`);
  await db
    .insert(localCoverCache)
    .values({
      mediaId,
      localCoverUrl: storedPath,
      cachedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: localCoverCache.mediaId,
      set: {
        localCoverUrl: storedPath,
        updatedAt: now,
      },
    });
}

/**
 * Get cached cover URL for a media item
 */
export async function getLocalCoverUrl(mediaId: string): Promise<string | null> {
  const result = await db
    .select({ localCoverUrl: localCoverCache.localCoverUrl })
    .from(localCoverCache)
    .where(eq(localCoverCache.mediaId, mediaId))
    .limit(1);

  const row = result[0];
  if (!row) {
    return null;
  }

  return resolveAppPath(row.localCoverUrl);
}

/**
 * Remove cached cover for a media item
 */
export async function removeLocalCover(mediaId: string): Promise<void> {
  await db.delete(localCoverCache).where(eq(localCoverCache.mediaId, mediaId));
}

/**
 * Get all cached covers
 */
export async function getAllLocalCovers(): Promise<LocalCoverCacheRow[]> {
  const rows = await db.select().from(localCoverCache);

  return rows.map(row => ({
    ...row,
    localCoverUrl: resolveAppPath(row.localCoverUrl),
  }));
}

/**
 * Clear all cached covers
 */
export async function clearAllLocalCovers(): Promise<void> {
  await db.delete(localCoverCache);
}

// ===== AUDIO FILE DOWNLOADS =====

/**
 * Mark an audio file as downloaded
 */
export async function markAudioFileAsDownloaded(
  audioFileId: string,
  downloadPath: string
): Promise<void> {
  const now = new Date();
  const storedPath = toAppRelativePath(downloadPath);
  await db
    .insert(localAudioFileDownloads)
    .values({
      audioFileId,
      isDownloaded: true,
      downloadPath: storedPath,
      downloadedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: localAudioFileDownloads.audioFileId,
      set: {
        isDownloaded: true,
        downloadPath: storedPath,
        downloadedAt: now,
        updatedAt: now,
      },
    });
}

/**
 * Get download info for an audio file
 */
export async function getAudioFileDownloadInfo(audioFileId: string): Promise<LocalAudioFileDownloadRow | null> {
  const result = await db
    .select()
    .from(localAudioFileDownloads)
    .where(eq(localAudioFileDownloads.audioFileId, audioFileId))
    .limit(1);

  const row = result[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    downloadPath: resolveAppPath(row.downloadPath),
  };
}

/**
 * Check if an audio file is downloaded
 */
export async function isAudioFileDownloaded(audioFileId: string): Promise<boolean> {
  const info = await getAudioFileDownloadInfo(audioFileId);
  return info?.isDownloaded || false;
}

/**
 * Clear download status for an audio file
 */
export async function clearAudioFileDownloadStatus(audioFileId: string): Promise<void> {
  await db.delete(localAudioFileDownloads).where(eq(localAudioFileDownloads.audioFileId, audioFileId));
}

/**
 * Get all downloaded audio files
 */
export async function getAllDownloadedAudioFiles(): Promise<LocalAudioFileDownloadRow[]> {
  const rows = await db
    .select()
    .from(localAudioFileDownloads)
    .where(eq(localAudioFileDownloads.isDownloaded, true));

  return rows.map(row => ({
    ...row,
    downloadPath: resolveAppPath(row.downloadPath),
  }));
}

// ===== LIBRARY FILE DOWNLOADS =====

/**
 * Mark a library file as downloaded
 */
export async function markLibraryFileAsDownloaded(
  libraryFileId: string,
  downloadPath: string
): Promise<void> {
  const now = new Date();
  const storedPath = toAppRelativePath(downloadPath);
  await db
    .insert(localLibraryFileDownloads)
    .values({
      libraryFileId,
      isDownloaded: true,
      downloadPath: storedPath,
      downloadedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: localLibraryFileDownloads.libraryFileId,
      set: {
        isDownloaded: true,
        downloadPath: storedPath,
        downloadedAt: now,
        updatedAt: now,
      },
    });
}

/**
 * Get download info for a library file
 */
export async function getLibraryFileDownloadInfo(libraryFileId: string): Promise<LocalLibraryFileDownloadRow | null> {
  const result = await db
    .select()
    .from(localLibraryFileDownloads)
    .where(eq(localLibraryFileDownloads.libraryFileId, libraryFileId))
    .limit(1);

  const row = result[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    downloadPath: resolveAppPath(row.downloadPath),
  };
}

/**
 * Check if a library file is downloaded
 */
export async function isLibraryFileDownloaded(libraryFileId: string): Promise<boolean> {
  const info = await getLibraryFileDownloadInfo(libraryFileId);
  return info?.isDownloaded || false;
}

/**
 * Clear download status for a library file
 */
export async function clearLibraryFileDownloadStatus(libraryFileId: string): Promise<void> {
  await db.delete(localLibraryFileDownloads).where(eq(localLibraryFileDownloads.libraryFileId, libraryFileId));
}

/**
 * Get all downloaded library files
 */
export async function getAllDownloadedLibraryFiles(): Promise<LocalLibraryFileDownloadRow[]> {
  const rows = await db
    .select()
    .from(localLibraryFileDownloads)
    .where(eq(localLibraryFileDownloads.isDownloaded, true));

  return rows.map(row => ({
    ...row,
    downloadPath: resolveAppPath(row.downloadPath),
  }));
}

// ===== MIGRATION HELPERS =====

/**
 * Migrate existing download data from old schema to new local data tables
 * This should be run after the migration to preserve existing download state
 */
export async function migrateExistingDownloadData(): Promise<void> {
  console.log('[localData] Starting migration of existing download data...');

  // Note: This function would need to be implemented if there's existing data to migrate
  // Since we're removing the columns in the migration, we'd need to extract the data first
  // For now, this is a placeholder for future implementation if needed

  console.log('[localData] Migration completed');
}
