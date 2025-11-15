import { getSQLiteDb } from '@/db/client';
import { markAudioFileAsDownloaded, markLibraryFileAsDownloaded, setLocalCoverCached } from './localData';

/**
 * Migration helper to preserve existing download data and cover URLs
 * This should be run BEFORE applying the migration that removes the columns
 */
export async function preserveExistingLocalData(): Promise<void> {
  console.log('[migrationHelpers] Starting preservation of existing local data...');

  try {
    const sqliteDb = getSQLiteDb();

    // Preserve existing cover URLs from mediaMetadata.imageUrl
    // Note: This assumes imageUrl contains local file paths, not API URLs
    const existingCovers = sqliteDb.getAllSync<{ id: string; image_url: string }>(`
      SELECT id, image_url
      FROM media_metadata
      WHERE image_url IS NOT NULL
        AND (image_url LIKE 'file://%' OR image_url LIKE '/Users/%' OR image_url LIKE '/storage/%')
    `);

    console.log(`[migrationHelpers] Found ${existingCovers.length} existing cover URLs to preserve`);

    for (const row of existingCovers) {
      const mediaId = row.id;
      const imageUrl = row.image_url;

      try {
        await setLocalCoverCached(mediaId, imageUrl);
        console.log(`[migrationHelpers] Preserved cover for media ${mediaId}: ${imageUrl}`);
      } catch (error) {
        console.error(`[migrationHelpers] Failed to preserve cover for media ${mediaId}:`, error);
      }
    }

    // Preserve existing audio file download data
    const existingAudioDownloads = sqliteDb.getAllSync<{ id: string; download_path: string; downloaded_at: string }>(`
      SELECT id, download_path, downloaded_at
      FROM audio_files
      WHERE is_downloaded = 1 AND download_path IS NOT NULL
    `);

    console.log(`[migrationHelpers] Found ${existingAudioDownloads.length} existing audio file downloads to preserve`);

    for (const row of existingAudioDownloads) {
      const audioFileId = row.id;
      const downloadPath = row.download_path;

      try {
        await markAudioFileAsDownloaded(audioFileId, downloadPath);
        console.log(`[migrationHelpers] Preserved audio download for ${audioFileId}: ${downloadPath}`);
      } catch (error) {
        console.error(`[migrationHelpers] Failed to preserve audio download for ${audioFileId}:`, error);
      }
    }

    // Preserve existing library file download data
    const existingLibraryDownloads = sqliteDb.getAllSync<{ id: string; download_path: string; downloaded_at: string }>(`
      SELECT id, download_path, downloaded_at
      FROM library_files
      WHERE is_downloaded = 1 AND download_path IS NOT NULL
    `);

    console.log(`[migrationHelpers] Found ${existingLibraryDownloads.length} existing library file downloads to preserve`);

    for (const row of existingLibraryDownloads) {
      const libraryFileId = row.id;
      const downloadPath = row.download_path;

      try {
        await markLibraryFileAsDownloaded(libraryFileId, downloadPath);
        console.log(`[migrationHelpers] Preserved library file download for ${libraryFileId}: ${downloadPath}`);
      } catch (error) {
        console.error(`[migrationHelpers] Failed to preserve library file download for ${libraryFileId}:`, error);
      }
    }

    console.log('[migrationHelpers] Successfully preserved existing local data');
  } catch (error) {
    console.error('[migrationHelpers] Failed to preserve existing local data:', error);
    throw error;
  }
}

/**
 * Verification helper to check that local data was preserved correctly
 */
export async function verifyLocalDataPreservation(): Promise<void> {
  console.log('[migrationHelpers] Verifying local data preservation...');

  try {
    const sqliteDb = getSQLiteDb();

    const coverCount = sqliteDb.getAllSync<{ count: number }>('SELECT COUNT(*) as count FROM local_cover_cache');
    const audioDownloadCount = sqliteDb.getAllSync<{ count: number }>('SELECT COUNT(*) as count FROM local_audio_file_downloads');
    const libraryDownloadCount = sqliteDb.getAllSync<{ count: number }>('SELECT COUNT(*) as count FROM local_library_file_downloads');

    console.log(`[migrationHelpers] Verification results:`);
    console.log(`  - Preserved covers: ${coverCount[0]?.count ?? 0}`);
    console.log(`  - Preserved audio downloads: ${audioDownloadCount[0]?.count ?? 0}`);
    console.log(`  - Preserved library downloads: ${libraryDownloadCount[0]?.count ?? 0}`);
  } catch (error) {
    console.error('[migrationHelpers] Failed to verify local data preservation:', error);
  }
}
