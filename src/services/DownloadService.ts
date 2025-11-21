import { clearAudioFileDownloadStatus, markAudioFileAsDownloaded } from "@/db/helpers/audioFiles";
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
  downloadFileExists,
  ensureDownloadsDirectory,
  getDownloadPath,
  getDownloadsDirectory,
  verifyFileExists,
} from "@/lib/fileSystem";
import { logger } from "@/lib/logger";
import { apiClientService } from "@/services/ApiClientService";
import type {
  DownloadConfig,
  DownloadInfo,
  DownloadProgress,
  DownloadProgressCallback,
  DownloadSpeedTracker,
  DownloadTaskInfo,
} from "@/types/services";
import RNBackgroundDownloader, {
  DownloadTask,
} from "@kesha-antonov/react-native-background-downloader";

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

  private constructor(config: DownloadConfig = DEFAULT_DOWNLOAD_CONFIG) {
    this.config = config;
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

    try {
      // Configure background downloader
      RNBackgroundDownloader.setConfig({
        progressInterval: this.config.progressInterval,
        isLogsEnabled: false,
      });

      log.info("Checking for existing background downloads...");
      const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();

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
   * Rewire progress callbacks - useful when rebuilding views
   */
  public rewireProgressCallbacks(
    libraryItemId: string,
    newCallback: DownloadProgressCallback
  ): () => void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (downloadInfo) {
      // Clear existing callbacks and add the new one
      downloadInfo.progressCallbacks.clear();
      return this.subscribeToProgress(libraryItemId, newCallback);
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
      log.warn(`Download already in progress for ${libraryItemId}, rejecting new download request`);
      throw new Error("Download already in progress for this item");
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
      };

      this.activeDownloads.set(libraryItemId, downloadInfo);

      let downloadedFiles = 0;
      let totalBytesDownloaded = 0;

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
          downloadedFiles,
          totalBytesDownloaded + fileBytesDownloaded,
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
              const downloadPath = getDownloadPath(libraryItemId, audioFile.filename);
              markAudioFileAsDownloaded(audioFile.id, downloadPath)
                .then(() => {
                  log.info(`File marked as downloaded, updating progress`);
                  downloadedFiles++;
                  totalBytesDownloaded += data.bytesDownloaded;
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
            await markAudioFileAsDownloaded(
              audioFile.id,
              getDownloadPath(libraryItemId, audioFile.filename)
            );
            downloadedFiles++;
            totalBytesDownloaded += audioFile.size || 0;
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
        taskInfo.task.pause();
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
        taskInfo.task.resume();
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
        taskInfo.task.stop();
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
   * Get download status for a library item
   */
  public getDownloadStatus(libraryItemId: string): DownloadInfo | undefined {
    return this.activeDownloads.get(libraryItemId);
  }

  /**
   * Check if a library item is fully downloaded
   */
  public async isLibraryItemDownloaded(libraryItemId: string): Promise<boolean> {
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
          // TODO: Could mark as not downloaded in database here
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
   * Get download progress for a library item
   */
  public async getDownloadProgress(
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
   * Delete downloaded files for a library item
   */
  public async deleteDownloadedLibraryItem(libraryItemId: string): Promise<void> {
    try {
      const dir = getDownloadsDirectory(libraryItemId);
      if (dir.exists) {
        await dir.delete();
        log.info(`Deleted downloads for ${libraryItemId}`);
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
    } catch (error) {
      log.error(`Failed to delete downloads for ${libraryItemId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Get total size of downloaded files for a library item
   */
  public async getDownloadedSize(libraryItemId: string): Promise<number> {
    try {
      const dir = getDownloadsDirectory(libraryItemId);
      if (!dir.exists) return 0;

      // Calculate from database
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

  // Private methods

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
    await ensureDownloadsDirectory(libraryItemId);
    const destPath = getDownloadPath(libraryItemId, audioFile.filename);

    // Check if file already exists and handle accordingly
    if (downloadFileExists(libraryItemId, audioFile.filename)) {
      if (forceRedownload) {
        log.info(`Force redownload requested, removing existing file: ${audioFile.filename}`);
        // TODO: Delete existing file before redownloading
        // For now, let the download overwrite it
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

    const task = RNBackgroundDownloader.download({
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
    })
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
      // Get the actual audio files from database to determine correct totals
      let totalExpectedFiles = tasks.length; // Fallback to task count
      try {
        const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
        if (metadata) {
          const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
          totalExpectedFiles = audioFiles.length;
          log.info(
            `ApiLibrary item ${libraryItemId} has ${audioFiles.length} audio files in database, ${tasks.length} active tasks`
          );
        }
      } catch (error) {
        log.error(`Error getting audio files for ${libraryItemId}:`, error as Error);
      }

      const downloadInfo: DownloadInfo = {
        tasks,
        progressCallbacks: new Set<DownloadProgressCallback>(),
        totalBytes: 0, // Will be calculated
        downloadedBytes: 0,
        isPaused: false,
        speedTracker: createSpeedTracker(),
        expectedTotalFiles: totalExpectedFiles, // Store the expected total
      };

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
          const downloadPath = getDownloadPath(libraryItemId, taskInfo.filename);
          markAudioFileAsDownloaded(taskInfo.audioFileId, downloadPath)
            .then(() => {
              log.info(`File marked as downloaded, calling handleTaskCompletion`);
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

    // Check if all tasks are completed
    const allTasksCompleted = downloadInfo.tasks.every((task) => task.task.state === "DONE");

    if (allTasksCompleted) {
      log.info(`All tasks completed for library item ${libraryItemId}`);

      // Send final completion progress update
      const totalBytes = downloadInfo.tasks.reduce((sum, task) => sum + (task.size || 0), 0);
      const finalProgress: DownloadProgress = {
        libraryItemId,
        status: "completed",
        totalProgress: 1.0,
        fileProgress: 1.0,
        currentFile: taskInfo.filename,
        downloadedFiles: downloadInfo.tasks.length,
        totalFiles: downloadInfo.tasks.length,
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

  private async handleTaskProgress(
    libraryItemId: string,
    taskInfo: DownloadTaskInfo,
    bytesDownloaded: number,
    bytesTotal: number
  ): Promise<void> {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (!downloadInfo) return;

    // Update the task info with current progress
    taskInfo.size = bytesTotal;

    // Calculate totals across all tasks
    const totalFiles = downloadInfo.expectedTotalFiles || downloadInfo.tasks.length;
    let downloadedFiles = 0;
    let totalBytesDownloaded = 0;
    let totalBytes = 0;

    log.info(
      `Calculating progress for ${libraryItemId}, ${totalFiles} expected files, ${downloadInfo.tasks.length} active tasks`
    );

    // First, check how many files are already downloaded in the database
    let alreadyDownloadedFiles = 0;
    try {
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (metadata) {
        const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
        alreadyDownloadedFiles = audioFiles.filter(
          (file) => file.downloadInfo?.isDownloaded
        ).length;
        log.info(`${alreadyDownloadedFiles} files already marked as downloaded in database`);

        // Calculate total bytes from all audio files
        totalBytes = audioFiles.reduce((sum, file) => sum + (file.size || 0), 0);

        // Add bytes from already downloaded files
        const downloadedFileBytes = audioFiles
          .filter((file) => file.downloadInfo?.isDownloaded)
          .reduce((sum, file) => sum + (file.size || 0), 0);
        totalBytesDownloaded += downloadedFileBytes;
        log.info(`Added ${downloadedFileBytes} bytes from already downloaded files`);
      }
    } catch (error) {
      log.error(`Error checking downloaded files:`, error as Error);
    }

    downloadedFiles = alreadyDownloadedFiles;

    for (const task of downloadInfo.tasks) {
      log.info(`Task ${task.filename}: state=${task.task.state}, size=${task.size}`);

      if (task.size && totalBytes === 0) {
        // Fallback: if we couldn't get total from database, sum from tasks
        totalBytes += task.size;
      }

      if (task.task.state === "DONE") {
        // Only count if not already counted in database
        const isAlreadyCounted = alreadyDownloadedFiles > 0; // Simplified check
        if (!isAlreadyCounted) {
          downloadedFiles++;
          totalBytesDownloaded += task.size || 0;
        }
        log.info(`Task ${task.filename} is DONE`);
      } else if (task === taskInfo) {
        // Current task progress
        totalBytesDownloaded += bytesDownloaded;
        log.info(`Current task ${task.filename} progress: ${bytesDownloaded}/${bytesTotal}`);
      } else {
        // This task is neither done nor current - we need to account for its progress too
        log.info(`Task ${task.filename} is neither current nor done, state: ${task.task.state}`);
      }
    }

    log.info(
      `Progress calculation: ${downloadedFiles}/${totalFiles} files, ${totalBytesDownloaded}/${totalBytes} bytes`
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
