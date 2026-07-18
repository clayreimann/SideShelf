import { markAudioFileAsDownloaded } from "@/db/helpers/audioFiles";
import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { cacheCoverIfMissing } from "@/lib/covers";
import {
  calculateSmoothedSpeed,
  clearDebounceTimer,
  createSpeedTracker,
  DEFAULT_DOWNLOAD_CONFIG,
} from "@/lib/downloads/speedTracker";
import {
  constructDownloadUrl,
  deleteDownloadFile,
  downloadFileExists,
  ensureDownloadsDirectory,
  getDownloadPath,
} from "@/lib/fileSystem";
import { setExcludeFromBackup } from "@/lib/iCloudBackupExclusion";
import { logger } from "@/lib/logger";
import { apiClientService } from "@/services/ApiClientService";
import { DownloadRepairCollaborator } from "@/services/download/DownloadRepairCollaborator";
import { DownloadStatusCollaborator } from "@/services/download/DownloadStatusCollaborator";
import type {
  IDownloadRepairCollaborator,
  IDownloadStatusCollaborator,
} from "@/services/download/types";
import type {
  DownloadConfig,
  DownloadInfo,
  DownloadProgress,
  DownloadProgressCallback,
  DownloadSpeedTracker,
  DownloadTaskInfo,
} from "@/types/services";
import {
  setConfig,
  getExistingDownloadTasks,
  createDownloadTask,
} from "@kesha-antonov/react-native-background-downloader";
import type { DownloadTask } from "@kesha-antonov/react-native-background-downloader";

// Create cached sublogger for this service
const log = logger.forTag("DownloadService");

// Re-export types for backward compatibility
export type {
  DownloadConfig,
  DownloadInfo,
  DownloadProgress,
  DownloadProgressCallback,
  DownloadSpeedTracker,
  DownloadTaskInfo,
};

export class DownloadService {
  private static instance: DownloadService;
  private activeDownloads = new Map<string, DownloadInfo>();
  private config: DownloadConfig;
  private isInitialized = false;
  private initializePromise: Promise<void> | null = null;
  private statusCollaborator!: IDownloadStatusCollaborator;
  private repairCollaborator!: IDownloadRepairCollaborator;

  private constructor(config: DownloadConfig = DEFAULT_DOWNLOAD_CONFIG) {
    this.config = config;
    this.statusCollaborator = new DownloadStatusCollaborator();
    this.repairCollaborator = new DownloadRepairCollaborator();
  }

  public static getInstance(config?: DownloadConfig): DownloadService {
    if (!DownloadService.instance) {
      DownloadService.instance = new DownloadService(config);
    }
    return DownloadService.instance;
  }

  /**
   * Initialize the download service and check for existing downloads
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this._doInitialize();
    return this.initializePromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Configure background downloader
      setConfig({
        progressInterval: this.config.progressInterval,
        isLogsEnabled: false,
      });

      log.info("Checking for existing background downloads...");
      const existingTasks = await getExistingDownloadTasks();

      if (existingTasks.length > 0) {
        log.info(`Found ${existingTasks.length} existing background downloads`);
        await this.restoreExistingDownloads(existingTasks);
      } else {
        log.info("No existing background downloads found");
      }

      this.isInitialized = true;
      log.info("Initialized successfully");
    } catch (error) {
      log.error("Error during initialization:", error as Error);
      throw error;
    }
  }

  /**
   * Subscribe to progress updates for a download
   */
  public subscribeToProgress(
    libraryItemId: string,
    callback: DownloadProgressCallback
  ): () => void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (downloadInfo) {
      downloadInfo.progressCallbacks.add(callback);

      // Send current progress immediately if available
      if (downloadInfo.speedTracker.lastProgressUpdate) {
        callback(downloadInfo.speedTracker.lastProgressUpdate);
      }
    }

    // Return unsubscribe function
    return () => {
      const info = this.activeDownloads.get(libraryItemId);
      if (info) {
        info.progressCallbacks.delete(callback);
      }
    };
  }

  /**
   * Unsubscribe from progress updates for a download
   */
  public unsubscribeFromProgress(libraryItemId: string, callback: DownloadProgressCallback): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (downloadInfo) {
      downloadInfo.progressCallbacks.delete(callback);
    }
  }

  /**
   * Get current progress for a download
   */
  public getCurrentProgress(libraryItemId: string): DownloadProgress | null {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    return downloadInfo?.speedTracker.lastProgressUpdate || null;
  }

  /**
   * Rewire progress callbacks - useful when rebuilding views.
   *
   * Only removes the callback that a *previous* call to rewireProgressCallbacks()
   * registered for this library item (tracked via `primaryCallback`), then adds
   * `newCallback` in its place. Other independent subscribers added via
   * subscribeToProgress() are left untouched.
   *
   * (No production call site exists for this method today — it's documented in
   * README.md as the reconnect hook for a rebuilding view. The previous
   * implementation called `progressCallbacks.clear()`, which would have silently
   * dropped any unrelated subscriber sharing the same libraryItemId.)
   */
  public rewireProgressCallbacks(
    libraryItemId: string,
    newCallback: DownloadProgressCallback
  ): () => void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (downloadInfo) {
      if (downloadInfo.primaryCallback) {
        downloadInfo.progressCallbacks.delete(downloadInfo.primaryCallback);
      }
      downloadInfo.progressCallbacks.add(newCallback);
      downloadInfo.primaryCallback = newCallback;

      // Send current progress immediately if available (matches subscribeToProgress)
      if (downloadInfo.speedTracker.lastProgressUpdate) {
        newCallback(downloadInfo.speedTracker.lastProgressUpdate);
      }

      return () => {
        const info = this.activeDownloads.get(libraryItemId);
        if (info) {
          info.progressCallbacks.delete(newCallback);
          if (info.primaryCallback === newCallback) {
            info.primaryCallback = undefined;
          }
        }
      };
    }

    return () => {}; // No-op unsubscribe function
  }

  /**
   * Start downloading a library item
   */
  public async startDownload(
    libraryItemId: string,
    onProgress?: DownloadProgressCallback,
    options?: { forceRedownload?: boolean }
  ): Promise<void> {
    const serverUrl = apiClientService.getBaseUrl();
    const token = apiClientService.getAccessToken();

    log.info(
      `startDownload called for ${libraryItemId} ${JSON.stringify({
        hasServerUrl: !!serverUrl,
        hasToken: !!token,
        hasCallback: !!onProgress,
        forceRedownload: options?.forceRedownload ?? false,
      })}`
    );

    if (!serverUrl || !token) {
      throw new Error("Server URL and access token are required for downloads");
    }

    if (!this.isInitialized) {
      log.info("Download service not initialized, initializing now...");
      await this.initialize();
    }

    // Check if already downloading
    if (this.isDownloadActive(libraryItemId)) {
      if (options?.forceRedownload) {
        log.info(`Force redownload requested for ${libraryItemId}, cancelling existing download`);
        await this.cancelDownload(libraryItemId);
      } else {
        log.warn(
          `Download already in progress for ${libraryItemId}, rejecting new download request`
        );
        throw new Error("Download already in progress for this item");
      }
    }

    log.info(`Starting download for library item ${libraryItemId}`);

    try {
      // Get metadata and audio files
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (!metadata) {
        throw new Error("Library item metadata not found");
      }

      const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
      if (audioFiles.length === 0) {
        throw new Error("No audio files found for this library item");
      }

      const totalFiles = audioFiles.length;
      const totalBytes = audioFiles.reduce((sum: number, file) => sum + (file.size || 0), 0);

      // Initialize download tracking
      const downloadInfo: DownloadInfo = {
        tasks: [],
        progressCallbacks: new Set(onProgress ? [onProgress] : []),
        totalBytes,
        downloadedBytes: 0,
        isPaused: false,
        speedTracker: createSpeedTracker(),
        completedFileIds: new Set(),
        completedBytes: 0,
        inFlightBytes: new Map(),
      };

      this.activeDownloads.set(libraryItemId, downloadInfo);

      const updateProgress = (
        currentFile: string,
        fileBytesDownloaded: number,
        fileTotalBytes: number,
        overrideStatus?: DownloadProgress["status"]
      ) => {
        this.updateProgress(
          libraryItemId,
          currentFile,
          fileBytesDownloaded,
          fileTotalBytes,
          totalFiles, // Don't count cover as a file
          downloadInfo.completedFileIds.size,
          this.computeAggregateBytes(downloadInfo),
          totalBytes,
          overrideStatus
        );
      };

      // Send initial progress update to immediately show download has started
      updateProgress("", 0, 0, "downloading");

      await cacheCoverIfMissing(libraryItemId);

      // Start all downloads concurrently
      const downloadPromises = audioFiles.map(async (audioFile: any) => {
        try {
          const task = await this.downloadAudioFile(
            libraryItemId,
            {
              id: audioFile.id,
              ino: audioFile.ino,
              filename: audioFile.filename,
              size: audioFile.size || undefined,
            },
            (taskInfo, bytesDownloaded, bytesTotal) => {
              this.updateInFlightBytes(downloadInfo, taskInfo.audioFileId, bytesDownloaded);
              updateProgress(taskInfo.filename, bytesDownloaded, bytesTotal);
            },
            options?.forceRedownload
          );

          const taskInfo: DownloadTaskInfo = {
            task,
            audioFileId: audioFile.id,
            filename: audioFile.filename,
            size: audioFile.size || 0,
          };

          downloadInfo.tasks.push(taskInfo);

          // Set up completion handlers
          return new Promise<void>((resolve, reject) => {
            task.done((data) => {
              log.info(
                `*** TASK COMPLETION HANDLER CALLED *** ${audioFile.filename}: ${data.bytesDownloaded} bytes`
              );
              const downloadPathUri = getDownloadPath(
                libraryItemId,
                audioFile.filename,
                "documents"
              );
              // Decode percent-encoding: files are saved at decoded POSIX paths (see downloadAudioFile).
              const downloadPathFs = decodeURIComponent(downloadPathUri.replace(/^file:\/\//, ""));
              markAudioFileAsDownloaded(audioFile.id, downloadPathUri, "documents")
                .then(async () => {
                  log.info(`File marked as downloaded, applying iCloud exclusion`);

                  // Apply iCloud backup exclusion
                  try {
                    await setExcludeFromBackup(downloadPathFs);
                    log.info(`iCloud exclusion applied to ${audioFile.filename}`);
                  } catch (error) {
                    log.error(
                      `Failed to set iCloud exclusion for ${audioFile.filename}:`,
                      error as Error
                    );
                    // Continue anyway - file is downloaded, just not excluded from backup
                  }

                  log.info(`Updating progress`);
                  this.markFileCompleted(downloadInfo, audioFile.id, data.bytesDownloaded);
                  updateProgress(
                    audioFile.filename,
                    data.bytesDownloaded,
                    data.bytesTotal,
                    "completed"
                  );
                  log.info(`Progress updated, resolving promise`);
                  resolve();
                })
                .catch(reject);
            });

            task.error((error) => {
              const errorObj = error instanceof Error ? error : new Error(String(error));
              log.error(`Error downloading ${audioFile.filename}:`, errorObj);
              const errorMessage =
                typeof error === "object" && error && "error" in error
                  ? String(error.error)
                  : String(error);
              reject(new Error(`Failed to download ${audioFile.filename}: ${errorMessage}`));
            });
          });
        } catch (error) {
          if (error instanceof Error && error.message === "File already exists") {
            // File already downloaded, mark as complete
            const downloadPath = getDownloadPath(libraryItemId, audioFile.filename, "documents");
            await markAudioFileAsDownloaded(audioFile.id, downloadPath, "documents");

            // Ensure iCloud exclusion is applied
            try {
              await setExcludeFromBackup(downloadPath);
            } catch (excludeError) {
              log.error(
                `Failed to set iCloud exclusion for existing file ${audioFile.filename}:`,
                excludeError as Error
              );
            }

            this.markFileCompleted(downloadInfo, audioFile.id, audioFile.size || 0);
            return;
          }
          throw error;
        }
      });

      // Wait for all downloads to complete
      await Promise.all(downloadPromises);

      // Download completed
      updateProgress("", 0, 0, "completed");
      this.cleanupDownload(libraryItemId);

      log.info(`Completed all downloads for library item ${libraryItemId}`);
    } catch (error) {
      log.error(`Download failed for library item ${libraryItemId}:`, error as Error);
      this.handleDownloadError(libraryItemId, error);
      throw error;
    }
  }

  /**
   * Pause a download
   */
  public pauseDownload(libraryItemId: string): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (downloadInfo && !downloadInfo.isPaused) {
      downloadInfo.tasks.forEach((taskInfo) => {
        void taskInfo.task.pause();
      });
      downloadInfo.isPaused = true;
      log.info(`Paused download for ${libraryItemId}`);

      // Trigger immediate progress update to show paused state
      this.triggerProgressUpdate(libraryItemId);
    }
  }

  /**
   * Resume a download
   */
  public resumeDownload(libraryItemId: string): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (downloadInfo && downloadInfo.isPaused) {
      downloadInfo.tasks.forEach((taskInfo) => {
        void taskInfo.task.resume();
      });
      downloadInfo.isPaused = false;
      log.info(`Resumed download for ${libraryItemId}`);

      // Trigger immediate progress update to show resumed state
      this.triggerProgressUpdate(libraryItemId);
    }
  }

  /**
   * Cancel a download
   */
  public cancelDownload(libraryItemId: string): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (downloadInfo) {
      // Clear any pending debounce timer
      clearDebounceTimer(downloadInfo.speedTracker);

      // Stop all tasks for this library item
      downloadInfo.tasks.forEach((taskInfo) => {
        void taskInfo.task.stop();
      });
      this.activeDownloads.delete(libraryItemId);
      log.info(`Cancelled download for ${libraryItemId}`);
    }
  }

  /**
   * Check if a download is active
   */
  public isDownloadActive(libraryItemId: string): boolean {
    const isActive = this.activeDownloads.has(libraryItemId);
    log.info(`Checking if download is active for ${libraryItemId}: ${isActive}`);
    return isActive;
  }

  /**
   * Get IDs of all library items with active (in-progress) downloads.
   * Used by DownloadSlice on init to sync Zustand state with restored downloads.
   */
  public getActiveDownloadIds(): string[] {
    return Array.from(this.activeDownloads.keys());
  }

  /**
   * Get download status for a library item
   */
  public getDownloadStatus(libraryItemId: string): DownloadInfo | undefined {
    return this.activeDownloads.get(libraryItemId);
  }

  /**
   * Check if a library item is fully downloaded
   */
  public async isLibraryItemDownloaded(libraryItemId: string): Promise<boolean> {
    return this.statusCollaborator.isLibraryItemDownloaded(libraryItemId);
  }

  /**
   * Get download progress for a library item
   */
  public async getDownloadProgress(
    libraryItemId: string
  ): Promise<{ downloaded: number; total: number; progress: number }> {
    return this.statusCollaborator.getDownloadProgress(libraryItemId);
  }

  /**
   * Repair download status for a library item.
   *
   * This addresses an iOS issue where the application container path changes between
   * app launches. Delegates to DownloadRepairCollaborator.
   *
   * @param libraryItemId The library item to repair
   * @returns Number of files repaired
   */
  public async repairDownloadStatus(libraryItemId: string): Promise<number> {
    return this.repairCollaborator.repairDownloadStatus(libraryItemId);
  }

  /**
   * Delete downloaded files for a library item and clear DB status.
   * Delegates to DownloadRepairCollaborator.
   */
  public async deleteDownloadedLibraryItem(libraryItemId: string): Promise<void> {
    return this.repairCollaborator.deleteDownloadedLibraryItem(libraryItemId);
  }

  /**
   * Get total size of downloaded files for a library item
   */
  public async getDownloadedSize(libraryItemId: string): Promise<number> {
    return this.statusCollaborator.getDownloadedSize(libraryItemId);
  }

  // Private methods

  /**
   * Unified per-file byte accounting, shared by the fresh-download path (startDownload)
   * and the restored path (handleTaskProgress / handleTaskCompletion / restoreExistingDownloads).
   *
   * A file's contribution to the aggregate is either "completed" (counted once, in full)
   * or "in-flight" (the most recent partial byte count), never both — markFileCompleted
   * removes any in-flight entry for the file so a task that finishes doesn't get counted
   * twice, and callers must check completedFileIds before recording further in-flight
   * progress for a file (see updateInFlightBytes).
   */

  /** Record a file as fully downloaded. Idempotent — a file already marked complete is not double-counted. */
  private markFileCompleted(downloadInfo: DownloadInfo, audioFileId: string, bytes: number): void {
    if (downloadInfo.completedFileIds.has(audioFileId)) return;
    downloadInfo.completedFileIds.add(audioFileId);
    downloadInfo.completedBytes += bytes;
    downloadInfo.inFlightBytes.delete(audioFileId);
  }

  /** Record the latest in-flight byte count for a file that has not yet completed. */
  private updateInFlightBytes(
    downloadInfo: DownloadInfo,
    audioFileId: string,
    bytes: number
  ): void {
    if (downloadInfo.completedFileIds.has(audioFileId)) return;
    downloadInfo.inFlightBytes.set(audioFileId, bytes);
  }

  /** Sum of completed bytes plus all currently in-flight bytes across every tracked file. */
  private computeAggregateBytes(downloadInfo: DownloadInfo): number {
    let sum = downloadInfo.completedBytes;
    for (const bytes of downloadInfo.inFlightBytes.values()) {
      sum += bytes;
    }
    return sum;
  }

  private async downloadAudioFile(
    libraryItemId: string,
    audioFile: { id: string; ino: string; filename: string; size?: number },
    onProgress?: (taskInfo: DownloadTaskInfo, bytesDownloaded: number, bytesTotal: number) => void,
    forceRedownload?: boolean
  ): Promise<DownloadTask> {
    const serverUrl = apiClientService.getBaseUrl();
    const token = apiClientService.getAccessToken();

    if (!serverUrl || !token) {
      throw new Error("Server URL and access token are required for downloads");
    }
    // Download to Documents directory for persistence
    await ensureDownloadsDirectory(libraryItemId, "documents");
    // getDownloadPath returns a file:// URI; RNBD's JS layer strips "file://" before passing to
    // native, which would create a URL-encoded POSIX path. [NSURL fileURLWithPath: encoded_path]
    // treats %20 as a literal character, so the file lands with percent signs in the filename
    // (e.g. "Columbus%20Day.m4b"). Decode the URI to get the actual POSIX path so the file
    // is saved with the real filename that our existence checks can find.
    const destUri = getDownloadPath(libraryItemId, audioFile.filename, "documents");
    const destPath = decodeURIComponent(destUri.replace(/^file:\/\//, ""));

    // Check if file already exists and handle accordingly
    if (downloadFileExists(libraryItemId, audioFile.filename, "documents")) {
      if (forceRedownload) {
        log.info(`Force redownload requested, removing existing file: ${audioFile.filename}`);
        // Delete the existing file before creating the task rather than relying on the
        // downloader's overwrite semantics — those aren't guaranteed and a stale/corrupt
        // file could otherwise survive a "redownload" request. Deletion uses the same
        // "documents" location + filename as the existence check above (destPath above
        // is percent-decoded for the downloader's destination, not for existence checks).
        deleteDownloadFile(libraryItemId, audioFile.filename, "documents");
      } else {
        log.info(`File already exists: ${audioFile.filename}`);
        throw new Error("File already exists");
      }
    }

    const downloadUrl = constructDownloadUrl(libraryItemId, audioFile.ino, serverUrl);
    log.info(`Starting background download: ${audioFile.filename} from ${downloadUrl}`);

    const taskInfo: DownloadTaskInfo = {
      task: null as any, // Will be set below
      audioFileId: audioFile.id,
      filename: audioFile.filename,
      size: audioFile.size || 0,
    };

    const task = createDownloadTask({
      id: `${libraryItemId}_${audioFile.id}`,
      url: downloadUrl,
      destination: destPath,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      metadata: {
        libraryItemId,
        audioFileId: audioFile.id,
        filename: audioFile.filename,
      },
    });

    // CRITICAL: Register ALL handlers BEFORE calling task.start()
    // The `begin` event fires immediately on start and will be missed if handlers register after.
    task
      .begin((data) => {
        log.info(`Download begin for ${audioFile.filename}: ${JSON.stringify(data)}`);
      })
      .progress((data) => {
        log.info(
          `Download progress for ${audioFile.filename}: ${data.bytesDownloaded}/${data.bytesTotal}`
        );
        const progressPercent = data.bytesDownloaded / data.bytesTotal;

        if (progressPercent >= 0.95) {
          log.info(
            `*** NEAR COMPLETION *** ${data.bytesDownloaded}/${data.bytesTotal} (${(progressPercent * 100).toFixed(2)}%) - ${data.bytesTotal - data.bytesDownloaded} bytes remaining`
          );
        }

        // Call the onProgress callback with taskInfo
        onProgress?.(taskInfo, data.bytesDownloaded, data.bytesTotal);
      })
      .done((data) => {
        log.info(
          `*** DOWNLOAD DONE EVENT FIRED *** ${audioFile.filename}: ${JSON.stringify(data)}`
        );
      })
      .error((data) => {
        log.info(`*** DOWNLOAD ERROR EVENT FIRED ***: ${JSON.stringify(data)}`);
      });

    task.start(); // explicit start — required by mainline v4 API

    // Now set the task reference in taskInfo
    taskInfo.task = task;

    return task;
  }

  private updateProgress(
    libraryItemId: string,
    currentFile: string,
    fileBytesDownloaded: number,
    fileTotalBytes: number,
    totalFiles: number,
    downloadedFiles: number,
    totalBytesDownloaded: number,
    totalBytes: number,
    overrideStatus?: DownloadProgress["status"]
  ): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (!downloadInfo) return;

    downloadInfo.downloadedBytes = totalBytesDownloaded;

    // Determine actual status based on download state
    let actualStatus: DownloadProgress["status"];
    if (overrideStatus) {
      actualStatus = overrideStatus;
    } else {
      actualStatus = downloadInfo.isPaused ? "paused" : "downloading";
    }

    // Calculate smoothed download speed
    const now = Date.now();
    const smoothedSpeed = calculateSmoothedSpeed(
      downloadInfo.speedTracker,
      totalBytesDownloaded,
      now,
      this.config
    );

    // Create progress update
    const progressUpdate: DownloadProgress = {
      libraryItemId,
      totalFiles,
      downloadedFiles,
      currentFile,
      fileProgress: fileTotalBytes > 0 ? fileBytesDownloaded / fileTotalBytes : 0,
      totalProgress: totalBytes > 0 ? totalBytesDownloaded / totalBytes : 0,
      bytesDownloaded: totalBytesDownloaded,
      totalBytes,
      fileBytesDownloaded,
      fileTotalBytes,
      downloadSpeed: smoothedSpeed,
      speedSampleCount: downloadInfo.speedTracker.sampleCount,
      status: actualStatus,
      canPause: actualStatus === "downloading",
      canResume: actualStatus === "paused",
    };

    // Store the last progress update for reference
    downloadInfo.speedTracker.lastProgressUpdate = progressUpdate;

    // Clear any existing debounce timer
    clearDebounceTimer(downloadInfo.speedTracker);

    // For completed/error states, update immediately
    if (actualStatus === "completed" || actualStatus === "error" || actualStatus === "cancelled") {
      this.notifyProgressCallbacks(downloadInfo, progressUpdate);
      return;
    }

    // Show first progress update immediately, then debounce subsequent updates
    if (!downloadInfo.speedTracker.hasShownInitialProgress) {
      downloadInfo.speedTracker.hasShownInitialProgress = true;
      this.notifyProgressCallbacks(downloadInfo, progressUpdate);
      return;
    }

    // For paused state, update immediately to show pause status
    if (actualStatus === "paused") {
      this.notifyProgressCallbacks(downloadInfo, progressUpdate);
      return;
    }

    // Debounce progress updates for downloading state
    downloadInfo.speedTracker.debounceTimer = setTimeout(() => {
      this.notifyProgressCallbacks(downloadInfo, progressUpdate);
    }, this.config.progressDebounceMs);
  }

  private notifyProgressCallbacks(downloadInfo: DownloadInfo, progress: DownloadProgress): void {
    downloadInfo.progressCallbacks.forEach((callback) => {
      try {
        callback(progress);
      } catch (error) {
        log.error("Error in progress callback:", error as Error);
      }
    });
  }

  private triggerProgressUpdate(libraryItemId: string): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (!downloadInfo || downloadInfo.progressCallbacks.size === 0) return;

    // Use the last known progress update if available, otherwise create a basic one
    const lastUpdate = downloadInfo.speedTracker.lastProgressUpdate;

    if (lastUpdate) {
      // Update the status and control flags based on current state
      const updatedProgress: DownloadProgress = {
        ...lastUpdate,
        status: downloadInfo.isPaused ? "paused" : "downloading",
        canPause: !downloadInfo.isPaused,
        canResume: downloadInfo.isPaused,
      };

      this.notifyProgressCallbacks(downloadInfo, updatedProgress);
    } else {
      // Fallback to basic progress update if no previous update exists
      // This shouldn't normally happen, but provides a safety net
      log.warn(`No previous progress update found for ${libraryItemId}, creating fallback`);

      const currentTotalBytes = downloadInfo.downloadedBytes;
      const actualStatus: DownloadProgress["status"] = downloadInfo.isPaused
        ? "paused"
        : "downloading";

      const progressUpdate: DownloadProgress = {
        libraryItemId,
        totalFiles: downloadInfo.tasks.length + 1, // +1 for cover
        downloadedFiles: 0, // We don't have accurate count without previous update
        currentFile: "Unknown",
        fileProgress: 0,
        totalProgress:
          downloadInfo.totalBytes > 0 ? currentTotalBytes / downloadInfo.totalBytes : 0,
        bytesDownloaded: currentTotalBytes,
        totalBytes: downloadInfo.totalBytes,
        fileBytesDownloaded: 0,
        fileTotalBytes: 0,
        downloadSpeed: downloadInfo.speedTracker.smoothedSpeed,
        speedSampleCount: downloadInfo.speedTracker.sampleCount,
        status: actualStatus,
        canPause: actualStatus === "downloading",
        canResume: actualStatus === "paused",
      };

      this.notifyProgressCallbacks(downloadInfo, progressUpdate);
    }
  }

  private async restoreExistingDownloads(existingTasks: DownloadTask[]): Promise<void> {
    // Group tasks by library item
    const tasksByLibraryItem = new Map<string, DownloadTaskInfo[]>();

    for (const task of existingTasks) {
      const libraryItemId = task.metadata?.libraryItemId;
      if (libraryItemId) {
        const tasks = tasksByLibraryItem.get(libraryItemId) || [];
        tasks.push({
          task,
          audioFileId: task.metadata.audioFileId,
          filename: task.metadata.filename,
          size: 0, // Will be updated from progress
        });
        tasksByLibraryItem.set(libraryItemId, tasks);
      }
    }

    // Restore download tracking for each library item
    for (const [libraryItemId, tasks] of tasksByLibraryItem) {
      const downloadInfo: DownloadInfo = {
        tasks,
        progressCallbacks: new Set<DownloadProgressCallback>(),
        totalBytes: 0, // Will be calculated below from the database, if available
        downloadedBytes: 0,
        isPaused: false,
        speedTracker: createSpeedTracker(),
        expectedTotalFiles: tasks.length, // Fallback to task count; refined below
        completedFileIds: new Set(),
        completedBytes: 0,
        inFlightBytes: new Map(),
      };

      // Fetch DB state once per restore (not on every progress event — see
      // handleTaskProgress) to determine the correct file/byte totals and to seed
      // any files that were already fully downloaded before this restore.
      try {
        const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
        if (metadata) {
          const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
          downloadInfo.expectedTotalFiles = audioFiles.length;
          downloadInfo.totalBytes = audioFiles.reduce(
            (sum: number, file) => sum + (file.size || 0),
            0
          );
          for (const file of audioFiles) {
            if (file.downloadInfo?.isDownloaded) {
              this.markFileCompleted(downloadInfo, file.id, file.size || 0);
            }
          }
          log.info(
            `ApiLibrary item ${libraryItemId} has ${audioFiles.length} audio files in database, ${tasks.length} active tasks, ${downloadInfo.completedFileIds.size} already downloaded`
          );
        }
      } catch (error) {
        log.error(`Error getting audio files for ${libraryItemId}:`, error as Error);
      }

      this.activeDownloads.set(libraryItemId, downloadInfo);

      // Set up event listeners for restored tasks
      for (const taskInfo of tasks) {
        taskInfo.task.progress((data: any) => {
          this.handleTaskProgress(libraryItemId, taskInfo, data.bytesDownloaded, data.bytesTotal);
        });

        taskInfo.task.done((data: any) => {
          log.info(
            `*** TASK DONE EVENT FIRED *** ${taskInfo.filename}: ${data.bytesDownloaded} bytes`
          );
          const downloadPathUri = getDownloadPath(libraryItemId, taskInfo.filename, "documents");
          // Decode percent-encoding: files are saved at decoded POSIX paths (see downloadAudioFile).
          const downloadPathFs = decodeURIComponent(downloadPathUri.replace(/^file:\/\//, ""));
          markAudioFileAsDownloaded(taskInfo.audioFileId, downloadPathUri, "documents")
            .then(async () => {
              log.info(`File marked as downloaded, applying iCloud exclusion`);

              // Apply iCloud backup exclusion
              try {
                await setExcludeFromBackup(downloadPathFs);
                log.info(`iCloud exclusion applied to ${taskInfo.filename}`);
              } catch (error) {
                log.error(
                  `Failed to set iCloud exclusion for ${taskInfo.filename}:`,
                  error as Error
                );
              }

              log.info(`Calling handleTaskCompletion`);
              this.handleTaskCompletion(libraryItemId, taskInfo, data.bytesDownloaded);
            })
            .catch((error: any) => {
              log.error(`Error marking file as downloaded:`, error);
            });
        });

        taskInfo.task.error((error: any) => {
          log.error(`Restored task error for ${taskInfo.filename}:`, error);
          this.handleDownloadError(libraryItemId, error);
        });

        // If the download completed while the app was killed, the native
        // downloadComplete event was already emitted and won't fire again.
        // Handle completion immediately so the task doesn't stay stuck in activeDownloads.
        if (taskInfo.task.state === "DONE") {
          log.info(
            `Task ${taskInfo.filename} already completed (done while app was killed), handling completion now`
          );
          const downloadPathUri = getDownloadPath(libraryItemId, taskInfo.filename, "documents");
          // Decode percent-encoding: files are saved at decoded POSIX paths (see downloadAudioFile).
          const downloadPathFs = decodeURIComponent(downloadPathUri.replace(/^file:\/\//, ""));
          markAudioFileAsDownloaded(taskInfo.audioFileId, downloadPathUri, "documents")
            .then(async () => {
              try {
                await setExcludeFromBackup(downloadPathFs);
              } catch (error) {
                log.error(
                  `Failed to set iCloud exclusion for ${taskInfo.filename}:`,
                  error as Error
                );
              }
              this.handleTaskCompletion(libraryItemId, taskInfo, taskInfo.task.bytesDownloaded);
            })
            .catch((error: any) => {
              log.error(`Error handling already-completed task ${taskInfo.filename}:`, error);
            });
        } else {
          // Resume the task to reconnect JS progress events to the native URLSession download.
          // getExistingDownloadTasks() returns restored tasks in a paused state at the JS layer;
          // resume() is required to start receiving progress/done/error events again.
          taskInfo.task.resume();
          log.info(`Resuming restored task for ${taskInfo.filename}`);
        }
      }

      log.info(`Restored ${tasks.length} tasks for library item ${libraryItemId}`);
    }
  }

  private handleTaskCompletion(
    libraryItemId: string,
    taskInfo: DownloadTaskInfo,
    bytesDownloaded: number
  ): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (!downloadInfo) return;

    log.info(`Task completed: ${taskInfo.filename} (${bytesDownloaded} bytes)`);

    // Record this file as fully downloaded. Falls back to the just-reported
    // bytesDownloaded if no progress event ever populated taskInfo.size (e.g. a task
    // that was already DONE at restore time before any progress event fired).
    // Idempotent: a file already counted (e.g. seeded from the DB snapshot taken at
    // restore) is not double-counted here.
    this.markFileCompleted(downloadInfo, taskInfo.audioFileId, taskInfo.size || bytesDownloaded);

    // Check if all active tasks are completed
    const allTasksCompleted = downloadInfo.tasks.every((task) => task.task.state === "DONE");

    if (allTasksCompleted) {
      log.info(`All tasks completed for library item ${libraryItemId}`);

      const totalFiles = downloadInfo.expectedTotalFiles || downloadInfo.tasks.length;
      const totalBytes =
        downloadInfo.totalBytes > 0 ? downloadInfo.totalBytes : downloadInfo.completedBytes;

      // Send final completion progress update
      const finalProgress: DownloadProgress = {
        libraryItemId,
        status: "completed",
        totalProgress: 1.0,
        fileProgress: 1.0,
        currentFile: taskInfo.filename,
        downloadedFiles: totalFiles,
        totalFiles,
        bytesDownloaded: totalBytes,
        totalBytes: totalBytes,
        fileBytesDownloaded: taskInfo.size || bytesDownloaded,
        fileTotalBytes: taskInfo.size || bytesDownloaded,
        downloadSpeed: 0,
        speedSampleCount: 0,
        canPause: false,
        canResume: false,
      };

      this.notifyProgressCallbacks(downloadInfo, finalProgress);

      // Clean up the download
      this.cleanupDownload(libraryItemId);
    } else {
      // Update progress to reflect the completed task
      this.triggerProgressUpdate(libraryItemId);
    }
  }

  private handleTaskProgress(
    libraryItemId: string,
    taskInfo: DownloadTaskInfo,
    bytesDownloaded: number,
    bytesTotal: number
  ): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (!downloadInfo) return;

    // Update the task info with current progress
    taskInfo.size = bytesTotal;

    this.updateInFlightBytes(downloadInfo, taskInfo.audioFileId, bytesDownloaded);

    // DB state (already-downloaded files, total file/byte counts) was fetched once at
    // restore time and lives on downloadInfo — no DB access here on every progress event.
    const totalFiles = downloadInfo.expectedTotalFiles || downloadInfo.tasks.length;
    const totalBytes =
      downloadInfo.totalBytes > 0
        ? downloadInfo.totalBytes
        : downloadInfo.tasks.reduce((sum, task) => sum + (task.size || 0), 0); // Fallback if DB fetch failed at restore

    const downloadedFiles = downloadInfo.completedFileIds.size;
    const totalBytesDownloaded = this.computeAggregateBytes(downloadInfo);

    log.info(
      `Progress calculation for ${libraryItemId}: ${downloadedFiles}/${totalFiles} files, ${totalBytesDownloaded}/${totalBytes} bytes`
    );

    this.updateProgress(
      libraryItemId,
      taskInfo.filename,
      bytesDownloaded,
      bytesTotal,
      totalFiles,
      downloadedFiles,
      totalBytesDownloaded,
      totalBytes
    );
  }

  private cleanupDownload(libraryItemId: string): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (downloadInfo) {
      clearDebounceTimer(downloadInfo.speedTracker);
      this.activeDownloads.delete(libraryItemId);
    }
  }

  private handleDownloadError(libraryItemId: string, error: unknown): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (downloadInfo) {
      clearDebounceTimer(downloadInfo.speedTracker);

      const errorProgress: DownloadProgress = {
        libraryItemId,
        totalFiles: 0,
        downloadedFiles: 0,
        currentFile: "",
        fileProgress: 0,
        totalProgress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        fileBytesDownloaded: 0,
        fileTotalBytes: 0,
        downloadSpeed: 0,
        speedSampleCount: 0,
        status: "error",
        error: String(error),
        canPause: false,
        canResume: false,
      };

      this.notifyProgressCallbacks(downloadInfo, errorProgress);
    }

    this.activeDownloads.delete(libraryItemId);
  }
}

// Export singleton instance
export const downloadService = DownloadService.getInstance();
