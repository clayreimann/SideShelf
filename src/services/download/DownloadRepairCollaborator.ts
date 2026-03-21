import { clearAudioFileDownloadStatus, markAudioFileAsDownloaded } from "@/db/helpers/audioFiles";
import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { cacheCoverIfMissing } from "@/lib/covers";
import { getDownloadPath, getDownloadsDirectory, verifyFileExists } from "@/lib/fileSystem";
import { setExcludeFromBackup } from "@/lib/iCloudBackupExclusion";
import { logger } from "@/lib/logger";
import { trace } from "@/lib/trace";
import type { IDownloadRepairCollaborator } from "@/services/download/types";

const log = logger.forTag("DownloadRepairCollaborator");

/**
 * Repair and delete collaborator for DownloadService.
 *
 * Responsibilities:
 *   - repairDownloadStatus: handles iOS container path changes by verifying stored paths
 *     and updating the DB with corrected paths (or clearing status if file is truly gone)
 *   - deleteDownloadedLibraryItem: deletes audio files from disk and clears DB status
 *
 * This collaborator has no access to the activeDownloads Map — that belongs
 * exclusively to the DownloadService facade.
 */
export class DownloadRepairCollaborator implements IDownloadRepairCollaborator {
  /**
   * Repair download status for a library item.
   *
   * This addresses an iOS issue where the application container path changes between
   * app launches. When this happens, absolute file paths stored in the database become
   * invalid even though the files still exist on disk.
   *
   * This function:
   * 1. Checks all audio files marked as downloaded
   * 2. Verifies each file exists at the stored path
   * 3. If not, attempts to find the file using just the filename (relative to the downloads directory)
   * 4. Updates the database with the corrected path if found
   * 5. Clears the download status if the file truly doesn't exist
   *
   * @param libraryItemId The library item to repair
   * @returns Number of files repaired
   */
  async repairDownloadStatus(libraryItemId: string): Promise<number> {
    log.info(`Repairing download status for ${libraryItemId}...`);

    const parentSpan = trace.startSpan("player.load.repair_download_paths", { libraryItemId });

    try {
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (!metadata) {
        log.info(`No metadata found for ${libraryItemId}`);
        trace.endSpan(parentSpan, "ok", { totalFiles: 0, repairedCount: 0, clearedCount: 0 });
        return 0;
      }

      const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
      if (audioFiles.length === 0) {
        log.info(`No audio files found for ${libraryItemId}`);
        trace.endSpan(parentSpan, "ok", { totalFiles: 0, repairedCount: 0, clearedCount: 0 });
        return 0;
      }

      let repairedCount = 0;
      let clearedCount = 0;

      for (const file of audioFiles) {
        if (!file.downloadInfo?.isDownloaded) {
          // Not marked as downloaded, skip
          continue;
        }

        const storedPath = file.downloadInfo.downloadPath;
        const existsAtStoredPath = await verifyFileExists(storedPath);

        if (existsAtStoredPath) {
          // File is fine, no repair needed
          const fileSpan = trace.startSpan(
            "player.load.repair_file",
            {
              audioFileId: file.id,
              filename: file.filename,
              storedPath,
              existsAtStoredPath: true,
              action: "ok",
            },
            parentSpan.context
          );
          trace.endSpan(fileSpan, "ok");
          continue;
        }

        log.warn(`File marked as downloaded but missing at stored path: ${file.filename}`);
        log.warn(`  Stored path: ${storedPath}`);

        // Try to find the file using the expected download path (current container)
        const expectedPath = getDownloadPath(libraryItemId, file.filename);
        const existsAtExpectedPath = await verifyFileExists(expectedPath);

        if (existsAtExpectedPath) {
          log.info(`  ✓ Found file at expected path: ${expectedPath}`);
          log.info(`  Updating database with corrected path...`);

          // Update the database with the corrected path
          await markAudioFileAsDownloaded(file.id, expectedPath);
          repairedCount++;

          // Re-apply iCloud exclusion after path repair (iOS container migration re-enables backup)
          try {
            await setExcludeFromBackup(expectedPath);
            log.info(`  ✓ iCloud exclusion re-applied after path repair: ${file.filename}`);
          } catch (error) {
            log.warn(
              `  iCloud exclusion failed after repair for ${file.filename}: ${String(error)}`
            );
            // Continue - path is repaired even if exclusion fails (best-effort)
          }

          log.info(`  ✓ Repaired download path for ${file.filename}`);

          const fileSpan = trace.startSpan(
            "player.load.repair_file",
            {
              audioFileId: file.id,
              filename: file.filename,
              storedPath,
              existsAtStoredPath: false,
              existsAtExpectedPath: true,
              expectedPath,
              action: "repaired",
            },
            parentSpan.context
          );
          trace.endSpan(fileSpan, "ok");
        } else {
          log.warn(`  ✗ File not found at expected path either: ${expectedPath}`);
          log.warn(`  File may have been deleted by iOS to free storage space`);
          log.warn(`  Clearing download status...`);

          // File truly doesn't exist, clear the download status
          await clearAudioFileDownloadStatus(file.id);
          clearedCount++;

          const fileSpan = trace.startSpan(
            "player.load.repair_file",
            {
              audioFileId: file.id,
              filename: file.filename,
              storedPath,
              existsAtStoredPath: false,
              existsAtExpectedPath: false,
              expectedPath,
              action: "cleared",
            },
            parentSpan.context
          );
          trace.endSpan(fileSpan, "ok");
        }
      }

      if (repairedCount > 0) {
        log.info(`Repaired ${repairedCount} file(s) for library item ${libraryItemId}`);
      } else {
        log.info(`No repairs needed for library item ${libraryItemId}`);
      }

      trace.endSpan(parentSpan, "ok", {
        totalFiles: audioFiles.length,
        repairedCount,
        clearedCount,
      });
      return repairedCount;
    } catch (error) {
      log.error(`Error repairing download status for ${libraryItemId}:`, error as Error);
      trace.endSpan(parentSpan, "error");
      return 0;
    }
  }

  /**
   * Delete downloaded files for a library item and clear DB status.
   */
  async deleteDownloadedLibraryItem(libraryItemId: string): Promise<void> {
    try {
      // Delete from both Documents and Caches directories
      const docsDir = getDownloadsDirectory(libraryItemId, "documents");
      if (docsDir.exists) {
        await docsDir.delete();
        log.info(`Deleted downloads from Documents for ${libraryItemId}`);
      }

      const cacheDir = getDownloadsDirectory(libraryItemId, "caches");
      if (cacheDir.exists) {
        await cacheDir.delete();
        log.info(`Deleted downloads from Caches for ${libraryItemId}`);
      }

      // Update database to mark files as not downloaded
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (metadata) {
        const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
        for (const audioFile of audioFiles) {
          if (audioFile.downloadInfo?.isDownloaded) {
            await clearAudioFileDownloadStatus(audioFile.id);
          }
        }
      }

      // Refresh cover cache after deletion
      await cacheCoverIfMissing(libraryItemId);
    } catch (error) {
      log.error(`Failed to delete downloads for ${libraryItemId}:`, error as Error);
      throw error;
    }
  }
}
