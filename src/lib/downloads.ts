import { clearAudioFileDownloadStatus, getAudioFilesForMedia, markAudioFileAsDownloaded } from '@/db/helpers/audioFiles';
import { getMediaMetadataByLibraryItemId } from '@/db/helpers/mediaMetadata';
import { cacheCoverIfMissing } from '@/lib/covers';
import RNBackgroundDownloader, { DownloadTask } from '@kesha-antonov/react-native-background-downloader';
import { Directory, File, Paths } from 'expo-file-system';

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

// Download speed smoothing configuration
const SPEED_SMOOTHING_FACTOR = 0.2; // Higher = more responsive, lower = smoother
const MIN_SAMPLES_FOR_ETA = 3; // Minimum progress updates before showing stable ETA
const PROGRESS_DEBOUNCE_MS = 350; // Debounce progress updates to reduce UI jitter

interface DownloadSpeedTracker {
  smoothedSpeed: number;
  sampleCount: number;
  lastUpdateTime: number;
  lastBytesDownloaded: number;
  debounceTimer?: ReturnType<typeof setTimeout>;
  hasShownInitialProgress: boolean;
  lastProgressUpdate?: DownloadProgress;
}

// Global download task tracking
const activeDownloads = new Map<string, {
  tasks: DownloadTaskInfo[];
  progressCallback?: DownloadProgressCallback;
  totalBytes: number;
  downloadedBytes: number;
  isPaused: boolean;
  speedTracker: DownloadSpeedTracker;
}>();

// Initialize background downloader configuration
RNBackgroundDownloader.setConfig({
  progressInterval: 300, // Update progress every 100ms
  // progressMinBytes: 1048576, // 1MB
  // isLogsEnabled: __DEV__, // Enable logs in development
});

export function cancelDownload(libraryItemId: string): void {
  const downloadInfo = activeDownloads.get(libraryItemId);
  if (downloadInfo) {
    // Clear any pending debounce timer
    if (downloadInfo.speedTracker.debounceTimer) {
      clearTimeout(downloadInfo.speedTracker.debounceTimer);
    }

    // Stop all tasks for this library item
    downloadInfo.tasks.forEach(taskInfo => {
      taskInfo.task.stop();
    });
    activeDownloads.delete(libraryItemId);
    console.log(`[downloads] Cancelled download for ${libraryItemId}`);
  }
}

export function pauseDownload(libraryItemId: string): void {
  const downloadInfo = activeDownloads.get(libraryItemId);
  if (downloadInfo && !downloadInfo.isPaused) {
    downloadInfo.tasks.forEach(taskInfo => {
      taskInfo.task.pause();
    });
    downloadInfo.isPaused = true;
    console.log(`[downloads] Paused download for ${libraryItemId}`);

    // Trigger immediate progress update to show paused state
    triggerProgressUpdate(libraryItemId);
  }
}

export function resumeDownload(libraryItemId: string): void {
  const downloadInfo = activeDownloads.get(libraryItemId);
  if (downloadInfo && downloadInfo.isPaused) {
    downloadInfo.tasks.forEach(taskInfo => {
      taskInfo.task.resume();
    });
    downloadInfo.isPaused = false;
    console.log(`[downloads] Resumed download for ${libraryItemId}`);

    // Trigger immediate progress update to show resumed state
    triggerProgressUpdate(libraryItemId);
  }
}

function isDownloadActive(libraryItemId: string): boolean {
  return activeDownloads.has(libraryItemId);
}

function getDownloadInfo(libraryItemId: string) {
  return activeDownloads.get(libraryItemId);
}

/**
 * Trigger a progress update for a download to refresh the UI state
 */
function triggerProgressUpdate(libraryItemId: string): void {
  const downloadInfo = getDownloadInfo(libraryItemId);
  if (!downloadInfo || !downloadInfo.progressCallback) return;

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

    downloadInfo.progressCallback(updatedProgress);
  } else {
    // Fallback to basic progress update if no previous update exists
    const currentTotalBytes = downloadInfo.downloadedBytes;
    const actualStatus: DownloadProgress['status'] = downloadInfo.isPaused ? 'paused' : 'downloading';

    const progressUpdate: DownloadProgress = {
      libraryItemId,
      totalFiles: 2,
      downloadedFiles: 1,
      currentFile: '',
      fileProgress: 0,
      totalProgress: downloadInfo.totalBytes > 0 ? currentTotalBytes / downloadInfo.totalBytes : 0,
      bytesDownloaded: currentTotalBytes,
      totalBytes: downloadInfo.totalBytes,
      fileBytesDownloaded: 0,
      fileTotalBytes: 0,
      downloadSpeed: downloadInfo.speedTracker.smoothedSpeed,
      status: actualStatus,
      canPause: actualStatus === 'downloading',
      canResume: actualStatus === 'paused',
    };

    downloadInfo.progressCallback(progressUpdate);
  }
}

/**
 * Calculate smoothed download speed using exponential moving average
 */
function calculateSmoothedSpeed(
  speedTracker: DownloadSpeedTracker,
  currentBytesDownloaded: number,
  currentTime: number
): number {
  const timeDelta = (currentTime - speedTracker.lastUpdateTime) / 1000; // Convert to seconds
  const bytesDelta = currentBytesDownloaded - speedTracker.lastBytesDownloaded;

  if (timeDelta <= 0 || bytesDelta < 0) {
    return speedTracker.smoothedSpeed;
  }

  const instantSpeed = bytesDelta / timeDelta;

  // For the first sample, use the instant speed
  if (speedTracker.sampleCount === 0) {
    speedTracker.smoothedSpeed = instantSpeed;
  } else {
    // Apply exponential moving average
    speedTracker.smoothedSpeed =
      (SPEED_SMOOTHING_FACTOR * instantSpeed) +
      ((1 - SPEED_SMOOTHING_FACTOR) * speedTracker.smoothedSpeed);
  }

  speedTracker.sampleCount++;
  speedTracker.lastUpdateTime = currentTime;
  speedTracker.lastBytesDownloaded = currentBytesDownloaded;

  return speedTracker.smoothedSpeed;
}

/**
 * Format bytes for display (e.g., "1.5 MB", "256 KB")
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format download speed for display (e.g., "1.2 MB/s")
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Estimate time remaining based on current speed
 */
export function formatTimeRemaining(bytesRemaining: number, bytesPerSecond: number, sampleCount: number = MIN_SAMPLES_FOR_ETA): string {
  if (bytesPerSecond === 0 || sampleCount < MIN_SAMPLES_FOR_ETA) {
    return 'Calculating...';
  }

  const secondsRemaining = bytesRemaining / bytesPerSecond;

  if (secondsRemaining < 60) {
    return `${Math.ceil(secondsRemaining)}s`;
  } else if (secondsRemaining < 3600) {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = Math.ceil(secondsRemaining % 60);
    return `${minutes}m ${seconds}s`;
  } else {
    const hours = Math.floor(secondsRemaining / 3600);
    const minutes = Math.floor((secondsRemaining % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Get the downloads directory for a specific library item
 */
export function getDownloadsDirectory(libraryItemId: string): Directory {
  return new Directory(Paths.cache, 'downloads', libraryItemId);
}

/**
 * Ensure the downloads directory exists for a library item
 */
async function ensureDownloadsDirectory(libraryItemId: string): Promise<void> {
  const dir = getDownloadsDirectory(libraryItemId);
  try {
    dir.create();
  } catch {}
}

/**
 * Construct download URL for an audio file based on the Swift code pattern
 */
function constructDownloadUrl(libraryItemId: string, audioFileIno: string, serverUrl: string, token: string): string {
  return `${serverUrl}/api/items/${libraryItemId}/file/${audioFileIno}/download`;
}

/**
 * Download a single audio file using react-native-background-downloader
 */
async function downloadAudioFile(
  libraryItemId: string,
  audioFile: { id: string; ino: string; filename: string; size?: number },
  serverUrl: string,
  token: string,
  onProgress?: (taskInfo: DownloadTaskInfo, bytesDownloaded: number, bytesTotal: number) => void
): Promise<DownloadTask> {
  await ensureDownloadsDirectory(libraryItemId);
  const dir = getDownloadsDirectory(libraryItemId);
  const destPath = `${dir.uri}/${audioFile.filename}`;

  // Check if file already exists and is marked as downloaded
  const destFile = new File(dir, audioFile.filename);
  if (destFile.exists) {
    console.log(`[downloads] File already exists: ${audioFile.filename}`);
    // Create a mock completed task for consistency
    throw new Error('File already exists');
  }

  const downloadUrl = constructDownloadUrl(libraryItemId, audioFile.ino, serverUrl, token);
  console.log(`[downloads] Starting background download: ${audioFile.filename} from ${downloadUrl}`);

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
    console.log('[downloads] Download begin:', data);
  }).progress(data => {
    console.log('[downloads] Download progress:', data);
  }).done((data) => {
    console.log('[downloads] Download done:', data);
  }).error((data) => {
    console.log('[downloads] Download error:', data);
  });

  const taskInfo: DownloadTaskInfo = {
    task,
    audioFileId: audioFile.id,
    filename: audioFile.filename,
    size: audioFile.size || 0,
  };

  // Set up progress callback
  task.progress((data) => {
    console.log('[downloads] Download progress:', data);
    onProgress?.(taskInfo, data.bytesDownloaded, data.bytesTotal);
  });

  return task;
}

/**
 * Download all audio files for a library item
 */
export async function downloadLibraryItem(
  libraryItemId: string,
  serverUrl: string,
  token: string,
  onProgress?: DownloadProgressCallback
): Promise<void> {
  console.log(`[downloads] Starting background download for library item ${libraryItemId}`);

  // Check if already downloading
  if (isDownloadActive(libraryItemId)) {
    throw new Error('Download already in progress for this item');
  }

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
    const downloadTasks: DownloadTaskInfo[] = [];
    let downloadedFiles = 0;
    let totalBytesDownloaded = 0;
    let downloadStartTime = Date.now();
    let lastProgressTime = downloadStartTime;
    let lastBytesDownloaded = 0;

    // Store download info
    activeDownloads.set(libraryItemId, {
      tasks: downloadTasks,
      progressCallback: onProgress,
      totalBytes,
      downloadedBytes: 0,
      isPaused: false,
      speedTracker: {
        smoothedSpeed: 0,
        sampleCount: 0,
        lastUpdateTime: Date.now(),
        lastBytesDownloaded: 0,
        hasShownInitialProgress: false,
      },
    });

    const updateProgress = (
      currentFile: string,
      fileBytesDownloaded: number,
      fileTotalBytes: number,
      overrideStatus?: DownloadProgress['status']
    ) => {
      const downloadInfo = getDownloadInfo(libraryItemId);
      if (!downloadInfo) return;

      const currentTotalBytes = totalBytesDownloaded + fileBytesDownloaded;
      downloadInfo.downloadedBytes = currentTotalBytes;

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
        currentTotalBytes,
        now
      );

      // Create progress update
      const progressUpdate: DownloadProgress = {
        libraryItemId,
        totalFiles: totalFiles + 1, // +1 for cover
        downloadedFiles,
        currentFile,
        fileProgress: fileTotalBytes > 0 ? fileBytesDownloaded / fileTotalBytes : 0,
        totalProgress: totalBytes > 0 ? currentTotalBytes / totalBytes : 0,
        bytesDownloaded: currentTotalBytes,
        totalBytes,
        fileBytesDownloaded,
        fileTotalBytes,
        downloadSpeed: smoothedSpeed,
        status: actualStatus,
        canPause: actualStatus === 'downloading',
        canResume: actualStatus === 'paused',
      };

      // Store the last progress update for reference
      downloadInfo.speedTracker.lastProgressUpdate = progressUpdate;

      // Clear any existing debounce timer
      if (downloadInfo.speedTracker.debounceTimer) {
        clearTimeout(downloadInfo.speedTracker.debounceTimer);
      }

      // For completed/error states, update immediately
      if (actualStatus === 'completed' || actualStatus === 'error' || actualStatus === 'cancelled') {
        onProgress?.(progressUpdate);
        return;
      }

      // Show first progress update immediately, then debounce subsequent updates
      if (!downloadInfo.speedTracker.hasShownInitialProgress) {
        downloadInfo.speedTracker.hasShownInitialProgress = true;
        onProgress?.(progressUpdate);
        return;
      }

      // For paused state, update immediately to show pause status
      if (actualStatus === 'paused') {
        onProgress?.(progressUpdate);
        return;
      }

      // Debounce progress updates for downloading state
      downloadInfo.speedTracker.debounceTimer = setTimeout(() => {
        onProgress?.(progressUpdate);
      }, PROGRESS_DEBOUNCE_MS);
    };

    // Download cover image first
    updateProgress('Cover image', 0, 0, 'downloading');
    await cacheCoverIfMissing(libraryItemId);
    downloadedFiles++;

    // Start all downloads concurrently
    const downloadPromises = audioFiles.map(async (audioFile) => {
      try {
        const task = await downloadAudioFile(
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
          }
        );

        const taskInfo: DownloadTaskInfo = {
          task,
          audioFileId: audioFile.id,
          filename: audioFile.filename,
          size: audioFile.size || 0,
        };

        downloadTasks.push(taskInfo);

        // Set up completion handlers
        return new Promise<void>((resolve, reject) => {
          task.done((data) => {
            console.log(`[downloads] Completed ${audioFile.filename}: ${data.bytesDownloaded} bytes`);
            const downloadPath = `${getDownloadsDirectory(libraryItemId).uri}/${audioFile.filename}`;
            markAudioFileAsDownloaded(audioFile.id, downloadPath).then(() => {
              downloadedFiles++;
              totalBytesDownloaded += data.bytesDownloaded;
              updateProgress(audioFile.filename, data.bytesDownloaded, data.bytesTotal);
              resolve();
            }).catch(reject);
          });

          task.error((error) => {
            console.error(`[downloads] Error downloading ${audioFile.filename}:`, error);
            const errorMessage = typeof error === 'object' && error && 'error' in error
              ? String(error.error)
              : String(error);
            reject(new Error(`Failed to download ${audioFile.filename}: ${errorMessage}`));
          });
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'File already exists') {
          // File already downloaded, mark as complete
          await markAudioFileAsDownloaded(audioFile.id, `${getDownloadsDirectory(libraryItemId).uri}/${audioFile.filename}`);
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

    // Clean up any pending timers
    const downloadInfo = getDownloadInfo(libraryItemId);
    if (downloadInfo?.speedTracker.debounceTimer) {
      clearTimeout(downloadInfo.speedTracker.debounceTimer);
    }

    activeDownloads.delete(libraryItemId);

    console.log(`[downloads] Completed all downloads for library item ${libraryItemId}`);
  } catch (error) {
    console.error(`[downloads] Download failed for library item ${libraryItemId}:`, error);

    // Clean up failed download
    const downloadInfo = getDownloadInfo(libraryItemId);
    if (downloadInfo?.speedTracker.debounceTimer) {
      clearTimeout(downloadInfo.speedTracker.debounceTimer);
    }
    activeDownloads.delete(libraryItemId);

    onProgress?.({
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
      status: 'error',
      error: String(error),
      canPause: false,
      canResume: false,
    });
    throw error;
  }
}

/**
 * Initialize background downloader and check for existing downloads
 * Should be called when the app starts
 */
export async function initializeDownloads(): Promise<void> {
  try {
    console.log('[downloads] Checking for existing background downloads...');
    const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();

    if (existingTasks.length > 0) {
      console.log(`[downloads] Found ${existingTasks.length} existing background downloads`);

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
        activeDownloads.set(libraryItemId, {
          tasks,
          totalBytes: 0, // Will be calculated
          downloadedBytes: 0,
          isPaused: false,
          speedTracker: {
            smoothedSpeed: 0,
            sampleCount: 0,
            lastUpdateTime: Date.now(),
            lastBytesDownloaded: 0,
            hasShownInitialProgress: false,
          },
        });

        console.log(`[downloads] Restored ${tasks.length} tasks for library item ${libraryItemId}`);
      }
    }
  } catch (error) {
    console.error('[downloads] Error checking for existing downloads:', error);
  }
}

/**
 * Check if a library item is fully downloaded
 */
export async function isLibraryItemDownloaded(libraryItemId: string): Promise<boolean> {
  try {
    const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
    if (!metadata) return false;

    const audioFiles = await getAudioFilesForMedia(metadata.id);
    if (audioFiles.length === 0) return false;

    // Check if all audio files are marked as downloaded
    return audioFiles.every(file => file.isDownloaded);
  } catch (error) {
    console.error(`[downloads] Error checking download status for ${libraryItemId}:`, error);
    return false;
  }
}

/**
 * Get download progress for a library item
 */
export async function getDownloadProgress(libraryItemId: string): Promise<{ downloaded: number; total: number; progress: number }> {
  try {
    const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
    if (!metadata) return { downloaded: 0, total: 0, progress: 0 };

    const audioFiles = await getAudioFilesForMedia(metadata.id);
    const total = audioFiles.length;
    const downloaded = audioFiles.filter(file => file.isDownloaded).length;
    const progress = total > 0 ? downloaded / total : 0;

    return { downloaded, total, progress };
  } catch (error) {
    console.error(`[downloads] Error getting download progress for ${libraryItemId}:`, error);
    return { downloaded: 0, total: 0, progress: 0 };
  }
}

/**
 * Delete downloaded files for a library item
 */
export async function deleteDownloadedLibraryItem(libraryItemId: string): Promise<void> {
  try {
    const dir = getDownloadsDirectory(libraryItemId);
    if (dir.exists) {
      await dir.delete();
      console.log(`[downloads] Deleted downloads for ${libraryItemId}`);
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
    console.error(`[downloads] Failed to delete downloads for ${libraryItemId}:`, error);
    throw error;
  }
}

/**
 * Get total size of downloaded files for a library item
 */
export async function getDownloadedSize(libraryItemId: string): Promise<number> {
  try {
    const dir = getDownloadsDirectory(libraryItemId);
    if (!dir.exists) return 0;

    // This would need to be implemented if expo-file-system supports directory size calculation
    // For now, we can calculate from database
    const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
    if (!metadata) return 0;

    const audioFiles = await getAudioFilesForMedia(metadata.id);
    return audioFiles
      .filter(file => file.isDownloaded)
      .reduce((total, file) => total + (file.size || 0), 0);
  } catch (error) {
    console.error(`[downloads] Error calculating download size for ${libraryItemId}:`, error);
    return 0;
  }
}
