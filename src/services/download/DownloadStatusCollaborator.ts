import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { verifyFileExists } from "@/lib/fileSystem";
import { logger } from "@/lib/logger";
import type { IDownloadStatusCollaborator } from "@/services/download/types";

const log = logger.forTag("DownloadStatusCollaborator");

/**
 * DB-backed status query collaborator for DownloadService.
 *
 * Responsibilities:
 *   - isLibraryItemDownloaded: queries DB + verifies files on disk
 *   - getDownloadProgress: queries DB to compute downloaded/total ratio
 *   - getDownloadedSize: sums file sizes for downloaded audio files
 *
 * This collaborator has no access to the activeDownloads Map — that belongs
 * exclusively to the DownloadService facade.
 */
export class DownloadStatusCollaborator implements IDownloadStatusCollaborator {
  /**
   * Check if a library item is fully downloaded.
   * Returns true only when all audio files are marked as downloaded in the DB
   * AND each file actually exists on disk.
   */
  async isLibraryItemDownloaded(libraryItemId: string): Promise<boolean> {
    log.info(`Checking download status for library item ${libraryItemId}...`);

    try {
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (!metadata) {
        log.info(`No metadata found for ${libraryItemId} - not downloaded`);
        return false;
      }

      const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
      if (audioFiles.length === 0) {
        log.info(`No audio files found for ${libraryItemId} - not downloaded`);
        return false;
      }

      log.info(
        `Found ${audioFiles.length} audio files for ${libraryItemId}, verifying download status...`
      );

      // Check if all audio files are marked as downloaded AND actually exist on disk
      const downloadCheckPromises = audioFiles.map(async (file, index) => {
        log.info(`Checking file ${index + 1}/${audioFiles.length}: ${file.filename}`);

        if (!file.downloadInfo?.isDownloaded) {
          log.info(`  ✗ File ${file.filename} not marked as downloaded in database`);
          return false;
        }

        log.info(
          `  ✓ File ${file.filename} marked as downloaded at: ${file.downloadInfo.downloadPath}`
        );

        // Verify the file actually exists on disk
        const fileExists = await verifyFileExists(file.downloadInfo.downloadPath);
        if (!fileExists) {
          log.warn(
            `  ✗ File ${file.filename} marked as downloaded but MISSING from disk at: ${file.downloadInfo.downloadPath}`
          );
          log.warn(`    This may indicate iOS cleaned up the file to free storage space`);
        } else {
          log.info(`  ✓ File ${file.filename} verified on disk`);
        }
        return fileExists;
      });

      const downloadResults = await Promise.all(downloadCheckPromises);
      const isDownloaded = downloadResults.every((result) => result);

      const downloadedCount = downloadResults.filter((r) => r).length;
      log.info(
        `Download verification complete for ${libraryItemId}: ${downloadedCount}/${audioFiles.length} files present on disk`
      );
      log.info(`Final result: ${isDownloaded ? "FULLY DOWNLOADED" : "NOT FULLY DOWNLOADED"}`);

      return isDownloaded;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      log.error(`Error checking download status for ${libraryItemId}:`, errorObj);
      return false;
    }
  }

  /**
   * Get download progress for a library item (file count ratio).
   */
  async getDownloadProgress(
    libraryItemId: string
  ): Promise<{ downloaded: number; total: number; progress: number }> {
    try {
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (!metadata) return { downloaded: 0, total: 0, progress: 0 };

      const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
      const total = audioFiles.length;
      const downloaded = audioFiles.filter((file) => file.downloadInfo?.isDownloaded).length;
      const progress = total > 0 ? downloaded / total : 0;

      return { downloaded, total, progress };
    } catch (error) {
      log.error(`Error getting download progress for ${libraryItemId}:`, error as Error);
      return { downloaded: 0, total: 0, progress: 0 };
    }
  }

  /**
   * Get total size of downloaded files for a library item (in bytes).
   */
  async getDownloadedSize(libraryItemId: string): Promise<number> {
    try {
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (!metadata) return 0;

      const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
      return audioFiles
        .filter((file) => file.downloadInfo?.isDownloaded)
        .reduce((total, file) => total + (file.size || 0), 0);
    } catch (error) {
      log.error(`Error calculating download size for ${libraryItemId}:`, error as Error);
      return 0;
    }
  }
}
