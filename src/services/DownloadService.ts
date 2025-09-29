import { clearAudioFileDownloadStatus, getAudioFilesForMedia, markAudioFileAsDownloaded } from '@/db/helpers/audioFiles';
import { getMediaMetadataByLibraryItemId } from '@/db/helpers/mediaMetadata';
import { cacheCoverIfMissing } from '@/lib/covers';
import {
    calculateSmoothedSpeed,
    clearDebounceTimer,
    createSpeedTracker,
    DEFAULT_DOWNLOAD_CONFIG
} from '@/lib/downloads/speedTracker';
import {
    constructDownloadUrl,
    downloadFileExists,
    ensureDownloadsDirectory,
    getDownloadPath,
    getDownloadsDirectory
} from '@/lib/fileSystem';
import RNBackgroundDownloader, { DownloadTask } from '@kesha-antonov/react-native-background-downloader';

// Types
export interface DownloadProgress {
  libraryItemId: string;
  totalFiles: number;
  downloadedFiles: number;
  currentFile: string;
  fileProgress: number; // 0-1 progress for current file
  totalProgress: number; // 0-1 overall progress
  bytesDownloaded: number;
  totalBytes: number;
  fileBytesDownloaded: number;
  fileTotalBytes: number;
  downloadSpeed: number; // bytes per second
  speedSampleCount: number; // number of speed samples collected
  status: 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: string;
  canPause?: boolean;
  canResume?: boolean;
}

export interface DownloadTaskInfo {
  task: DownloadTask;
  audioFileId: string;
  filename: string;
  size: number;
}

export type DownloadProgressCallback = (progress: DownloadProgress) => void;

export interface DownloadSpeedTracker {
  smoothedSpeed: number;
  sampleCount: number;
  lastUpdateTime: number;
  lastBytesDownloaded: number;
  debounceTimer?: ReturnType<typeof setTimeout>;
  hasShownInitialProgress: boolean;
  lastProgressUpdate?: DownloadProgress;
}

export interface DownloadInfo {
  tasks: DownloadTaskInfo[];
  progressCallbacks: Set<DownloadProgressCallback>;
  totalBytes: number;
  downloadedBytes: number;
  isPaused: boolean;
  speedTracker: DownloadSpeedTracker;
  expectedTotalFiles?: number; // Total files expected (from database), not just active tasks
}

export interface DownloadConfig {
  speedSmoothingFactor: number;
  minSamplesForEta: number;
  progressDebounceMs: number;
  progressInterval: number;
}

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

      console.log('[DownloadService] Checking for existing background downloads...');
      const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();

      if (existingTasks.length > 0) {
        console.log(`[DownloadService] Found ${existingTasks.length} existing background downloads`);
        await this.restoreExistingDownloads(existingTasks);
      } else {
        console.log('[DownloadService] No existing background downloads found');
      }

      this.isInitialized = true;
      console.log('[DownloadService] Initialized successfully');
    } catch (error) {
      console.error('[DownloadService] Error during initialization:', error);
      throw error;
    }
  }

  /**
   * Subscribe to progress updates for a download
   */
  public subscribeToProgress(libraryItemId: string, callback: DownloadProgressCallback): () => void {
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
  public rewireProgressCallbacks(libraryItemId: string, newCallback: DownloadProgressCallback): () => void {
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
    serverUrl: string,
    token: string,
    onProgress?: DownloadProgressCallback,
    options?: { forceRedownload?: boolean }
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Check if already downloading
    if (this.isDownloadActive(libraryItemId)) {
      throw new Error('Download already in progress for this item');
    }

    console.log(`[DownloadService] Starting download for library item ${libraryItemId}`);

    try {
      // Get metadata and audio files
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (!metadata) {
        throw new Error('Library item metadata not found');
      }

      const audioFiles = await getAudioFilesForMedia(metadata.id);
      if (audioFiles.length === 0) {
        throw new Error('No audio files found for this library item');
      }

      const totalFiles = audioFiles.length;
      const totalBytes = audioFiles.reduce((sum, file) => sum + (file.size || 0), 0);

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
        overrideStatus?: DownloadProgress['status']
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

      // Download cover image first (but don't count it as a file)
      updateProgress('Cover image', 0, 0, 'downloading');
      await cacheCoverIfMissing(libraryItemId);
      // Don't increment downloadedFiles for cover

      // Start all downloads concurrently
      const downloadPromises = audioFiles.map(async (audioFile) => {
        try {
          const task = await this.downloadAudioFile(
            libraryItemId,
            {
              id: audioFile.id,
              ino: audioFile.ino,
              filename: audioFile.filename,
              size: audioFile.size || undefined,
            },
            serverUrl,
            token,
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
              console.log(`[DownloadService] *** TASK COMPLETION HANDLER CALLED *** ${audioFile.filename}: ${data.bytesDownloaded} bytes`);
              const downloadPath = getDownloadPath(libraryItemId, audioFile.filename);
              markAudioFileAsDownloaded(audioFile.id, downloadPath).then(() => {
                console.log(`[DownloadService] File marked as downloaded, updating progress`);
                downloadedFiles++;
                totalBytesDownloaded += data.bytesDownloaded;
                updateProgress(audioFile.filename, data.bytesDownloaded, data.bytesTotal, 'completed');
                console.log(`[DownloadService] Progress updated, resolving promise`);
                resolve();
              }).catch(reject);
            });

            task.error((error) => {
              console.error(`[DownloadService] Error downloading ${audioFile.filename}:`, error);
              const errorMessage = typeof error === 'object' && error && 'error' in error
                ? String(error.error)
                : String(error);
              reject(new Error(`Failed to download ${audioFile.filename}: ${errorMessage}`));
            });
          });
        } catch (error) {
          if (error instanceof Error && error.message === 'File already exists') {
            // File already downloaded, mark as complete
            await markAudioFileAsDownloaded(audioFile.id, getDownloadPath(libraryItemId, audioFile.filename));
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
      updateProgress('', 0, 0, 'completed');
      this.cleanupDownload(libraryItemId);

      console.log(`[DownloadService] Completed all downloads for library item ${libraryItemId}`);
    } catch (error) {
      console.error(`[DownloadService] Download failed for library item ${libraryItemId}:`, error);
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
      downloadInfo.tasks.forEach(taskInfo => {
        taskInfo.task.pause();
      });
      downloadInfo.isPaused = true;
      console.log(`[DownloadService] Paused download for ${libraryItemId}`);

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
      downloadInfo.tasks.forEach(taskInfo => {
        taskInfo.task.resume();
      });
      downloadInfo.isPaused = false;
      console.log(`[DownloadService] Resumed download for ${libraryItemId}`);

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
      downloadInfo.tasks.forEach(taskInfo => {
        taskInfo.task.stop();
      });
      this.activeDownloads.delete(libraryItemId);
      console.log(`[DownloadService] Cancelled download for ${libraryItemId}`);
    }
  }

  /**
   * Check if a download is active
   */
  public isDownloadActive(libraryItemId: string): boolean {
    const isActive = this.activeDownloads.has(libraryItemId);
    console.log(`[DownloadService] Checking if download is active for ${libraryItemId}: ${isActive}`);
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
    try {
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (!metadata) return false;

      const audioFiles = await getAudioFilesForMedia(metadata.id);
      if (audioFiles.length === 0) return false;

      // Check if all audio files are marked as downloaded
      const isDownloaded = audioFiles.every(file => file.isDownloaded);
      console.log(`[DownloadService] Checking if library item is downloaded for ${libraryItemId}: ${isDownloaded}`);
      return isDownloaded;
    } catch (error) {
      console.error(`[DownloadService] Error checking download status for ${libraryItemId}:`, error);
      return false;
    }
  }

  /**
   * Get download progress for a library item
   */
  public async getDownloadProgress(libraryItemId: string): Promise<{ downloaded: number; total: number; progress: number }> {
    try {
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (!metadata) return { downloaded: 0, total: 0, progress: 0 };

      const audioFiles = await getAudioFilesForMedia(metadata.id);
      const total = audioFiles.length;
      const downloaded = audioFiles.filter(file => file.isDownloaded).length;
      const progress = total > 0 ? downloaded / total : 0;

      return { downloaded, total, progress };
    } catch (error) {
      console.error(`[DownloadService] Error getting download progress for ${libraryItemId}:`, error);
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
        console.log(`[DownloadService] Deleted downloads for ${libraryItemId}`);
      }

      // Update database to mark files as not downloaded
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (metadata) {
        const audioFiles = await getAudioFilesForMedia(metadata.id);
        for (const audioFile of audioFiles) {
          if (audioFile.isDownloaded) {
            await clearAudioFileDownloadStatus(audioFile.id);
          }
        }
      }
    } catch (error) {
      console.error(`[DownloadService] Failed to delete downloads for ${libraryItemId}:`, error);
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

      const audioFiles = await getAudioFilesForMedia(metadata.id);
      return audioFiles
        .filter(file => file.isDownloaded)
        .reduce((total, file) => total + (file.size || 0), 0);
    } catch (error) {
      console.error(`[DownloadService] Error calculating download size for ${libraryItemId}:`, error);
      return 0;
    }
  }

  // Private methods

  private async downloadAudioFile(
    libraryItemId: string,
    audioFile: { id: string; ino: string; filename: string; size?: number },
    serverUrl: string,
    token: string,
    onProgress?: (taskInfo: DownloadTaskInfo, bytesDownloaded: number, bytesTotal: number) => void,
    forceRedownload?: boolean
  ): Promise<DownloadTask> {
    await ensureDownloadsDirectory(libraryItemId);
    const destPath = getDownloadPath(libraryItemId, audioFile.filename);

    // Check if file already exists and handle accordingly
    if (downloadFileExists(libraryItemId, audioFile.filename)) {
      if (forceRedownload) {
        console.log(`[DownloadService] Force redownload requested, removing existing file: ${audioFile.filename}`);
        // TODO: Delete existing file before redownloading
        // For now, let the download overwrite it
      } else {
        console.log(`[DownloadService] File already exists: ${audioFile.filename}`);
        throw new Error('File already exists');
      }
    }

    const downloadUrl = constructDownloadUrl(libraryItemId, audioFile.ino, serverUrl);
    console.log(`[DownloadService] Starting background download: ${audioFile.filename} from ${downloadUrl}`);

    const task = RNBackgroundDownloader.download({
      id: `${libraryItemId}_${audioFile.id}`,
      url: downloadUrl,
      destination: destPath,
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      metadata: {
        libraryItemId,
        audioFileId: audioFile.id,
        filename: audioFile.filename,
      }
    }).begin((data) => {
      console.log('[DownloadService] Download begin:', data);
    }).progress(data => {
      console.log('[DownloadService] Download progress:', data);
      const progressPercent = data.bytesDownloaded / data.bytesTotal;

      if (progressPercent >= 0.95) {
        console.log(`[DownloadService] *** NEAR COMPLETION *** ${data.bytesDownloaded}/${data.bytesTotal} (${(progressPercent*100).toFixed(2)}%) - ${data.bytesTotal - data.bytesDownloaded} bytes remaining`);

      }
    }).done((data) => {
      console.log(`[DownloadService] *** DOWNLOAD DONE EVENT FIRED *** ${audioFile.filename}:`, data);
    }).error((data) => {
      console.log(`[DownloadService] *** DOWNLOAD ERROR EVENT FIRED ***:`, data);
    });

    const taskInfo: DownloadTaskInfo = {
      task,
      audioFileId: audioFile.id,
      filename: audioFile.filename,
      size: audioFile.size || 0,
    };

    // Set up progress callback
    task.progress((data) => {
      console.log('[DownloadService] Download progress:', data);
      onProgress?.(taskInfo, data.bytesDownloaded, data.bytesTotal);
    });

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
    overrideStatus?: DownloadProgress['status']
  ): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (!downloadInfo) return;

    downloadInfo.downloadedBytes = totalBytesDownloaded;

    // Determine actual status based on download state
    let actualStatus: DownloadProgress['status'];
    if (overrideStatus) {
      actualStatus = overrideStatus;
    } else {
      actualStatus = downloadInfo.isPaused ? 'paused' : 'downloading';
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
      canPause: actualStatus === 'downloading',
      canResume: actualStatus === 'paused',
    };

    // Store the last progress update for reference
    downloadInfo.speedTracker.lastProgressUpdate = progressUpdate;

    // Clear any existing debounce timer
    clearDebounceTimer(downloadInfo.speedTracker);

    // For completed/error states, update immediately
    if (actualStatus === 'completed' || actualStatus === 'error' || actualStatus === 'cancelled') {
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
    if (actualStatus === 'paused') {
      this.notifyProgressCallbacks(downloadInfo, progressUpdate);
      return;
    }

    // Debounce progress updates for downloading state
    downloadInfo.speedTracker.debounceTimer = setTimeout(() => {
      this.notifyProgressCallbacks(downloadInfo, progressUpdate);
    }, this.config.progressDebounceMs);
  }

  private notifyProgressCallbacks(downloadInfo: DownloadInfo, progress: DownloadProgress): void {
    downloadInfo.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('[DownloadService] Error in progress callback:', error);
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
        status: downloadInfo.isPaused ? 'paused' : 'downloading',
        canPause: !downloadInfo.isPaused,
        canResume: downloadInfo.isPaused,
      };

      this.notifyProgressCallbacks(downloadInfo, updatedProgress);
    } else {
      // Fallback to basic progress update if no previous update exists
      // This shouldn't normally happen, but provides a safety net
      console.warn(`[DownloadService] No previous progress update found for ${libraryItemId}, creating fallback`);

      const currentTotalBytes = downloadInfo.downloadedBytes;
      const actualStatus: DownloadProgress['status'] = downloadInfo.isPaused ? 'paused' : 'downloading';

      const progressUpdate: DownloadProgress = {
        libraryItemId,
        totalFiles: downloadInfo.tasks.length + 1, // +1 for cover
        downloadedFiles: 0, // We don't have accurate count without previous update
        currentFile: 'Unknown',
        fileProgress: 0,
        totalProgress: downloadInfo.totalBytes > 0 ? currentTotalBytes / downloadInfo.totalBytes : 0,
        bytesDownloaded: currentTotalBytes,
        totalBytes: downloadInfo.totalBytes,
        fileBytesDownloaded: 0,
        fileTotalBytes: 0,
        downloadSpeed: downloadInfo.speedTracker.smoothedSpeed,
        speedSampleCount: downloadInfo.speedTracker.sampleCount,
        status: actualStatus,
        canPause: actualStatus === 'downloading',
        canResume: actualStatus === 'paused',
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
          const audioFiles = await getAudioFilesForMedia(metadata.id);
          totalExpectedFiles = audioFiles.length;
          console.log(`[DownloadService] Library item ${libraryItemId} has ${audioFiles.length} audio files in database, ${tasks.length} active tasks`);
        }
      } catch (error) {
        console.error(`[DownloadService] Error getting audio files for ${libraryItemId}:`, error);
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
        taskInfo.task.progress((data) => {
          this.handleTaskProgress(libraryItemId, taskInfo, data.bytesDownloaded, data.bytesTotal);
        });

        taskInfo.task.done((data) => {
          console.log(`[DownloadService] *** TASK DONE EVENT FIRED *** ${taskInfo.filename}: ${data.bytesDownloaded} bytes`);
          const downloadPath = getDownloadPath(libraryItemId, taskInfo.filename);
          markAudioFileAsDownloaded(taskInfo.audioFileId, downloadPath).then(() => {
            console.log(`[DownloadService] File marked as downloaded, calling handleTaskCompletion`);
            this.handleTaskCompletion(libraryItemId, taskInfo, data.bytesDownloaded);
          }).catch(error => {
            console.error(`[DownloadService] Error marking file as downloaded:`, error);
          });
        });

        taskInfo.task.error((error) => {
          console.error(`[DownloadService] Restored task error for ${taskInfo.filename}:`, error);
          this.handleDownloadError(libraryItemId, error);
        });
      }

      console.log(`[DownloadService] Restored ${tasks.length} tasks for library item ${libraryItemId}`);
    }
  }

  private handleTaskCompletion(
    libraryItemId: string,
    taskInfo: DownloadTaskInfo,
    bytesDownloaded: number
  ): void {
    const downloadInfo = this.activeDownloads.get(libraryItemId);
    if (!downloadInfo) return;

    console.log(`[DownloadService] Task completed: ${taskInfo.filename} (${bytesDownloaded} bytes)`);

    // Check if all tasks are completed
    const allTasksCompleted = downloadInfo.tasks.every(task => task.task.state === 'DONE');

    if (allTasksCompleted) {
      console.log(`[DownloadService] All tasks completed for library item ${libraryItemId}`);

      // Send final completion progress update
      const totalBytes = downloadInfo.tasks.reduce((sum, task) => sum + (task.size || 0), 0);
      const finalProgress: DownloadProgress = {
        libraryItemId,
        status: 'completed',
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

    console.log(`[DownloadService] Calculating progress for ${libraryItemId}, ${totalFiles} expected files, ${downloadInfo.tasks.length} active tasks`);

    // First, check how many files are already downloaded in the database
    let alreadyDownloadedFiles = 0;
    try {
      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (metadata) {
        const audioFiles = await getAudioFilesForMedia(metadata.id);
        alreadyDownloadedFiles = audioFiles.filter(file => file.isDownloaded).length;
        console.log(`[DownloadService] ${alreadyDownloadedFiles} files already marked as downloaded in database`);

        // Calculate total bytes from all audio files
        totalBytes = audioFiles.reduce((sum, file) => sum + (file.size || 0), 0);

        // Add bytes from already downloaded files
        const downloadedFileBytes = audioFiles
          .filter(file => file.isDownloaded)
          .reduce((sum, file) => sum + (file.size || 0), 0);
        totalBytesDownloaded += downloadedFileBytes;
        console.log(`[DownloadService] Added ${downloadedFileBytes} bytes from already downloaded files`);
      }
    } catch (error) {
      console.error(`[DownloadService] Error checking downloaded files:`, error);
    }

    downloadedFiles = alreadyDownloadedFiles;

    for (const task of downloadInfo.tasks) {
      console.log(`[DownloadService] Task ${task.filename}: state=${task.task.state}, size=${task.size}`);

      if (task.size && totalBytes === 0) {
        // Fallback: if we couldn't get total from database, sum from tasks
        totalBytes += task.size;
      }

      if (task.task.state === 'DONE') {
        // Only count if not already counted in database
        const isAlreadyCounted = alreadyDownloadedFiles > 0; // Simplified check
        if (!isAlreadyCounted) {
          downloadedFiles++;
          totalBytesDownloaded += task.size || 0;
        }
        console.log(`[DownloadService] Task ${task.filename} is DONE`);
      } else if (task === taskInfo) {
        // Current task progress
        totalBytesDownloaded += bytesDownloaded;
        console.log(`[DownloadService] Current task ${task.filename} progress: ${bytesDownloaded}/${bytesTotal}`);
      } else {
        // This task is neither done nor current - we need to account for its progress too
        console.log(`[DownloadService] Task ${task.filename} is neither current nor done, state: ${task.task.state}`);
      }
    }

    console.log(`[DownloadService] Progress calculation: ${downloadedFiles}/${totalFiles} files, ${totalBytesDownloaded}/${totalBytes} bytes`);

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
        currentFile: '',
        fileProgress: 0,
        totalProgress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        fileBytesDownloaded: 0,
        fileTotalBytes: 0,
        downloadSpeed: 0,
        speedSampleCount: 0,
        status: 'error',
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
