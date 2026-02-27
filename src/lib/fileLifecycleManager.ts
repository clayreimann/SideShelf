/**
 * File Lifecycle Manager
 *
 * Manages the lifecycle of downloaded audiobook files between Documents and Caches directories.
 *
 * Strategy:
 * - New downloads go to Documents (persistent, won't be cleaned by iOS)
 * - Files are marked with iCloud backup exclusion to prevent backup bloat
 * - Finished or inactive (>2 weeks) books move to Caches (can be reclaimed by iOS)
 * - When user plays an unfinished book, files move back to Documents
 */

import { logger } from "@/lib/logger";
import {
  getDownloadPath,
  moveAudioFile,
  getAudioFileLocation,
  type StorageLocation,
  ensureDownloadsDirectory,
  verifyFileExists,
  getDownloadsDirectory,
} from "@/lib/fileSystem";
import { setExcludeFromBackup } from "@/lib/iCloudBackupExclusion";
import {
  updateAudioFileStorageLocation,
  updateAudioFileDownloadPath,
  clearAudioFileDownloadStatus,
  getAllDownloadedAudioFiles,
  getDownloadedAudioFilesWithLibraryInfo,
} from "@/db/helpers/localData";
import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { downloadService } from "@/services/DownloadService";
import RNBackgroundDownloader from "@kesha-antonov/react-native-background-downloader";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { getMediaProgressForLibraryItem } from "@/db/helpers/mediaProgress";

const log = logger.forTag("FileLifecycleManager");

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks in milliseconds

export interface CleanedUpFile {
  libraryItemId: string;
  title: string;
  audioFileId: string;
  filename: string;
}

/**
 * Internal helper to move all audio files for a library item between storage locations
 */
async function moveItemBetweenLocations(
  libraryItemId: string,
  targetLocation: StorageLocation,
  applyICloudExclusion: boolean
): Promise<boolean> {
  const sourceLocation: StorageLocation = targetLocation === "documents" ? "caches" : "documents";

  try {
    log.info(`Moving item ${libraryItemId} to ${targetLocation}`);

    // Get metadata to find audio files
    const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
    if (!metadata) {
      log.warn(`No metadata found for ${libraryItemId}`);
      return false;
    }

    const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
    if (audioFiles.length === 0) {
      log.warn(`No audio files found for ${libraryItemId}`);
      return false;
    }

    // Ensure target directory exists
    await ensureDownloadsDirectory(libraryItemId, targetLocation);

    let allSucceeded = true;

    for (const audioFile of audioFiles) {
      if (!audioFile.downloadInfo?.isDownloaded) {
        continue;
      }

      // Check current location
      const currentLocation = getAudioFileLocation(libraryItemId, audioFile.filename);

      if (currentLocation === targetLocation) {
        // Already at target location
        if (applyICloudExclusion && targetLocation === "documents") {
          // Ensure iCloud exclusion is set
          const path = getDownloadPath(libraryItemId, audioFile.filename, "documents");
          try {
            await setExcludeFromBackup(path);
            log.info(`iCloud exclusion applied to ${audioFile.filename}`);
          } catch (error) {
            log.error(`Failed to set iCloud exclusion for ${audioFile.filename}:`, error as Error);
          }
        }
        continue;
      }

      if (currentLocation !== sourceLocation) {
        log.warn(`File ${audioFile.filename} not found in either location`);
        allSucceeded = false;
        continue;
      }

      // Move from source to target
      const toDocuments = targetLocation === "documents";
      const success = await moveAudioFile(libraryItemId, audioFile.filename, toDocuments);

      if (success) {
        // Update database
        const newPath = getDownloadPath(libraryItemId, audioFile.filename, targetLocation);
        await updateAudioFileStorageLocation(audioFile.id, targetLocation, newPath);

        // Apply iCloud backup exclusion for Documents
        if (applyICloudExclusion && targetLocation === "documents") {
          try {
            await setExcludeFromBackup(newPath);
            log.info(`Moved ${audioFile.filename} to ${targetLocation} with iCloud exclusion`);
          } catch (error) {
            log.error(`Failed to set iCloud exclusion for ${audioFile.filename}:`, error as Error);
            // Continue anyway - file is moved, just not excluded from backup
          }
        } else {
          log.info(`Moved ${audioFile.filename} to ${targetLocation}`);
        }
      } else {
        log.error(`Failed to move ${audioFile.filename} to ${targetLocation}`);
        allSucceeded = false;
      }
    }

    return allSucceeded;
  } catch (error) {
    log.error(`Error moving item ${libraryItemId} to ${targetLocation}:`, error as Error);
    return false;
  }
}

/**
 * Move all audio files for a library item to Documents directory
 * and apply iCloud backup exclusion
 */
export async function moveItemToDocuments(libraryItemId: string): Promise<boolean> {
  return moveItemBetweenLocations(libraryItemId, "documents", true);
}

/**
 * Move all audio files for a library item to Caches directory
 */
export async function moveItemToCaches(libraryItemId: string): Promise<boolean> {
  return moveItemBetweenLocations(libraryItemId, "caches", false);
}

/**
 * Ensure an item's files are in Documents directory before playback
 * Synchronous operation - blocks until move is complete
 */
export async function ensureItemInDocuments(libraryItemId: string): Promise<void> {
  log.info(`Ensuring item ${libraryItemId} is in Documents`);

  // Get metadata to find audio files
  const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
  if (!metadata) {
    log.warn(`No metadata found for ${libraryItemId}, cannot ensure location`);
    return;
  }

  const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
  if (audioFiles.length === 0) {
    log.warn(`No audio files found for ${libraryItemId}`);
    return;
  }

  // Check if any files need to be moved
  let needsMove = false;
  for (const audioFile of audioFiles) {
    if (!audioFile.downloadInfo?.isDownloaded) {
      continue;
    }

    const location = getAudioFileLocation(libraryItemId, audioFile.filename);
    if (location === "caches") {
      needsMove = true;
      break;
    }
  }

  if (!needsMove) {
    log.info(`All files already in Documents for ${libraryItemId}`);
    return;
  }

  // Move to Documents
  const success = await moveItemToDocuments(libraryItemId);
  if (!success) {
    log.warn(
      `Failed to move some files to Documents for ${libraryItemId}, playback may continue from cache`
    );
    // Don't throw - allow playback to continue even if move failed
  }
}

/**
 * Check if an item should be moved to cache based on finished status or inactivity
 */
export async function shouldMoveToCache(libraryItemId: string, userId: string): Promise<boolean> {
  try {
    // Get progress
    const progress = await getMediaProgressForLibraryItem(libraryItemId, userId);

    // If finished, move to cache
    if (progress?.isFinished) {
      log.info(`Item ${libraryItemId} is finished, should move to cache`);
      return true;
    }

    // Check last accessed time
    const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
    if (!metadata) {
      return false;
    }

    const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
    if (audioFiles.length === 0) {
      return false;
    }

    // Find the most recent lastAccessedAt time
    let mostRecentAccess: Date | null = null;
    for (const audioFile of audioFiles) {
      const lastAccessed = audioFile.downloadInfo?.lastAccessedAt;
      if (lastAccessed) {
        if (!mostRecentAccess || lastAccessed > mostRecentAccess) {
          mostRecentAccess = lastAccessed;
        }
      }
    }

    // If no access time recorded, don't move (might be newly downloaded)
    if (!mostRecentAccess) {
      return false;
    }

    // Check if inactive for more than 2 weeks
    const now = new Date();
    const timeSinceAccess = now.getTime() - mostRecentAccess.getTime();

    if (timeSinceAccess > TWO_WEEKS_MS) {
      log.info(`Item ${libraryItemId} inactive for >2 weeks, should move to cache`);
      return true;
    }

    return false;
  } catch (error) {
    log.error(`Error checking if item ${libraryItemId} should move to cache:`, error as Error);
    return false;
  }
}

/**
 * Detect files that were cleaned up by iOS
 * Returns list of affected items with titles
 */
export async function detectCleanedUpFiles(): Promise<CleanedUpFile[]> {
  log.info("Scanning for files cleaned up by iOS...");

  const cleanedFiles: CleanedUpFile[] = [];

  try {
    // Get all downloaded audio files with library item info
    const downloadedFiles = await getDownloadedAudioFilesWithLibraryInfo();

    for (const downloadInfo of downloadedFiles) {
      // Verify file exists on disk
      const exists = await verifyFileExists(downloadInfo.downloadPath);

      if (!exists) {
        log.warn(
          `File marked as downloaded but missing: ${downloadInfo.downloadPath} (${downloadInfo.title})`
        );

        cleanedFiles.push({
          libraryItemId: downloadInfo.libraryItemId,
          title: downloadInfo.title,
          audioFileId: downloadInfo.audioFileId,
          filename: downloadInfo.filename,
        });

        // Clear download status
        await clearAudioFileDownloadStatus(downloadInfo.audioFileId);
      }
    }

    log.info(`Found ${cleanedFiles.length} files that were cleaned up by iOS`);
    return cleanedFiles;
  } catch (error) {
    log.error("Error detecting cleaned up files:", error as Error);
    return [];
  }
}

/**
 * Run a download reconciliation scan on foreground resume.
 *
 * Performs two operations:
 * 1. Stale record scan — finds DB records for files that no longer exist on disk
 *    and clears them, then invalidates the Zustand store for those items.
 * 2. Zombie detection — finds background download tasks tracked by the OS but
 *    not by DownloadService (i.e. orphaned from a previous app session), stops
 *    them, deletes their partial files, and clears any DB records.
 *
 * Active and paused downloads are always skipped — `isDownloadActive` returns
 * true for both states because paused items remain in the activeDownloads Map.
 */
export async function runDownloadReconciliationScan(): Promise<void> {
  log.info("[ReconciliationScan] Starting download reconciliation scan...");

  try {
    // --- Step 1: Stale record scan ---
    const downloadedFiles = await getDownloadedAudioFilesWithLibraryInfo();

    // Track which library items had at least one file cleared or repaired
    const clearedLibraryItems = new Set<string>();
    const repairedLibraryItems = new Set<string>();

    for (const downloadInfo of downloadedFiles) {
      const { libraryItemId } = downloadInfo;

      // Skip items with active or paused downloads — isDownloadActive covers both
      if (downloadService.isDownloadActive(libraryItemId)) {
        log.info(`[ReconciliationScan] Skipping active/paused download: ${libraryItemId}`);
        continue;
      }

      const exists = await verifyFileExists(downloadInfo.downloadPath);
      if (!exists) {
        // Before clearing the record, check if the file exists at the current-container path.
        // iOS changes the app container UUID on every update, making stored absolute paths stale.
        // New code stores portable relative paths (via toAppRelativePath), but existing records
        // from before this fix may still be absolute. Attempt repair by looking for the file at
        // its expected location under the current container.
        let repaired = false;
        for (const location of ["documents", "caches"] as const) {
          const currentPath = getDownloadPath(libraryItemId, downloadInfo.filename, location);
          const existsAtCurrentPath = await verifyFileExists(currentPath);
          if (existsAtCurrentPath) {
            log.info(
              `[ReconciliationScan] Repaired stale path for ${downloadInfo.filename} (${libraryItemId}) — updating to ${location} path`
            );
            await updateAudioFileDownloadPath(downloadInfo.audioFileId, currentPath);
            repairedLibraryItems.add(libraryItemId);
            repaired = true;
            break;
          }
        }

        if (!repaired) {
          log.warn(
            `[ReconciliationScan] Cleared stale record: ${downloadInfo.filename} (${libraryItemId})`
          );
          await clearAudioFileDownloadStatus(downloadInfo.audioFileId);
          clearedLibraryItems.add(libraryItemId);
        }
      }
    }

    // --- Step 2: Zustand store invalidation / repair ---
    if (clearedLibraryItems.size > 0 || repairedLibraryItems.size > 0) {
      // Dynamic import to avoid circular dependency — appStore imports DownloadService
      const { useAppStore } = await import("@/stores/appStore");

      for (const libraryItemId of clearedLibraryItems) {
        useAppStore.getState().removeDownloadedItem(libraryItemId);
      }
      if (clearedLibraryItems.size > 0) {
        log.info(
          `[ReconciliationScan] Invalidated ${clearedLibraryItems.size} items in Zustand store`
        );
      }

      // For items that had stale paths repaired, ensure they appear as downloaded in the
      // Zustand store. This covers the case where removeDownloadedItem was called for the
      // same item (some files cleared, some repaired) — re-adding preserves the repaired files.
      for (const libraryItemId of repairedLibraryItems) {
        useAppStore.getState().completeDownload(libraryItemId);
      }
      if (repairedLibraryItems.size > 0) {
        log.info(
          `[ReconciliationScan] Refreshed ${repairedLibraryItems.size} repaired items in Zustand store`
        );
      }
    }

    // --- Step 3: Zombie detection ---
    const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();

    for (const task of existingTasks) {
      // Parse libraryItemId from task ID format: "${libraryItemId}_${audioFile.id}"
      const underscoreIdx = task.id.indexOf("_");
      const libraryItemId = underscoreIdx !== -1 ? task.id.slice(0, underscoreIdx) : task.id;

      // If DownloadService knows about this task, it is legitimate — leave it alone
      if (downloadService.isDownloadActive(libraryItemId)) {
        continue;
      }

      // Zombie task: not tracked by DownloadService — stop it and clean up
      log.warn(`[ReconciliationScan] Zombie cleared: ${libraryItemId}`);
      task.stop();

      // Delete partial files from both storage locations
      const docsDir = getDownloadsDirectory(libraryItemId, "documents");
      if (docsDir.exists) {
        docsDir.delete();
      }
      const cachesDir = getDownloadsDirectory(libraryItemId, "caches");
      if (cachesDir.exists) {
        cachesDir.delete();
      }

      // Clear any DB records for this zombie item's audio files
      const zombieFiles = downloadedFiles.filter((f) => f.libraryItemId === libraryItemId);
      for (const zombieFile of zombieFiles) {
        await clearAudioFileDownloadStatus(zombieFile.audioFileId);
      }
    }

    log.info("[ReconciliationScan] Reconciliation scan complete");
  } catch (error) {
    log.error("[ReconciliationScan] Error during reconciliation scan:", error as Error);
    // Don't rethrow — caller uses fire-and-forget .catch() pattern
    throw error;
  }
}

/**
 * Perform periodic cleanup - move finished/inactive items to cache
 * This should be called on app startup and periodically while app is running
 */
export async function performPeriodicCleanup(userId: string): Promise<{
  movedItems: string[];
  errors: Array<{ libraryItemId: string; error: string }>;
}> {
  log.info("Starting periodic cleanup of inactive downloads...");

  const results = {
    movedItems: [] as string[],
    errors: [] as Array<{ libraryItemId: string; error: string }>,
  };

  try {
    // Get all downloaded files with library item info
    const downloadedFiles = await getDownloadedAudioFilesWithLibraryInfo();

    // Group by library item to avoid duplicate checks
    const itemsMap = new Map<string, Set<string>>();

    for (const downloadInfo of downloadedFiles) {
      if (!itemsMap.has(downloadInfo.libraryItemId)) {
        itemsMap.set(downloadInfo.libraryItemId, new Set());
      }
      itemsMap.get(downloadInfo.libraryItemId)!.add(downloadInfo.audioFileId);
    }

    log.info(`Checking ${itemsMap.size} library items for cleanup eligibility`);

    // Check each unique library item
    for (const [libraryItemId, audioFileIds] of itemsMap) {
      try {
        // Check if item should move to cache
        const shouldMove = await shouldMoveToCache(libraryItemId, userId);

        if (shouldMove) {
          log.info(
            `Item ${libraryItemId} is eligible for cleanup (${audioFileIds.size} files), moving to Caches`
          );

          const success = await moveItemToCaches(libraryItemId);

          if (success) {
            results.movedItems.push(libraryItemId);
            log.info(`Successfully moved ${libraryItemId} to Caches`);
          } else {
            const error = "Move operation failed";
            results.errors.push({ libraryItemId, error });
            log.warn(`Failed to move ${libraryItemId} to Caches: ${error}`);
          }
        }
      } catch (error) {
        const errorMsg = (error as Error).message;
        results.errors.push({ libraryItemId, error: errorMsg });
        log.error(`Error processing cleanup for ${libraryItemId}:`, error as Error);
      }
    }

    log.info(
      `Periodic cleanup completed: ${results.movedItems.length} items moved, ${results.errors.length} errors`
    );
  } catch (error) {
    log.error("Error during periodic cleanup:", error as Error);
  }

  return results;
}
