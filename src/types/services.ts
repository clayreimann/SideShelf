/**
 * Service-related types and interfaces
 *
 * These types define interfaces for services like downloads,
 * API clients, and other business logic components.
 */

// Download service types
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
  status: "downloading" | "paused" | "completed" | "error" | "cancelled";
  error?: string;
  canPause?: boolean;
  canResume?: boolean;
}

export interface DownloadTaskInfo {
  task: any; // DownloadTask from react-native-background-downloader
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

  // Unified per-file byte accounting (see DownloadService's markFileCompleted /
  // updateInFlightBytes / computeAggregateBytes). Keyed by audioFileId so the same
  // logical file is tracked consistently across the two distinct DownloadTaskInfo
  // object instances that startDownload() creates for it (one held internally by
  // downloadAudioFile(), one pushed onto `tasks`).
  completedFileIds: Set<string>; // audioFileIds counted as fully downloaded (task DONE, or already downloaded per DB at restore time, or pre-existing file found on disk)
  completedBytes: number; // sum of full-file sizes for entries in completedFileIds
  inFlightBytes: Map<string, number>; // audioFileId -> most recent reported bytesDownloaded, for files not yet in completedFileIds

  // Tracks the callback most recently registered via rewireProgressCallbacks() so a
  // later rewire only removes that specific callback, never other independent
  // subscribers added via subscribeToProgress().
  primaryCallback?: DownloadProgressCallback;
}

export interface DownloadConfig {
  speedSmoothingFactor: number;
  minSamplesForEta: number;
  progressDebounceMs: number;
  progressInterval: number;
}
