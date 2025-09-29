// Local type definitions to avoid circular dependency
interface DownloadConfig {
  speedSmoothingFactor: number;
  minSamplesForEta: number;
  progressDebounceMs: number;
  progressInterval: number;
}

interface DownloadProgress {
  libraryItemId: string;
  totalFiles: number;
  downloadedFiles: number;
  currentFile: string;
  fileProgress: number;
  totalProgress: number;
  bytesDownloaded: number;
  totalBytes: number;
  fileBytesDownloaded: number;
  fileTotalBytes: number;
  downloadSpeed: number;
  speedSampleCount: number;
  status: 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: string;
  canPause?: boolean;
  canResume?: boolean;
}

interface DownloadSpeedTracker {
  smoothedSpeed: number;
  sampleCount: number;
  lastUpdateTime: number;
  lastBytesDownloaded: number;
  debounceTimer?: ReturnType<typeof setTimeout>;
  hasShownInitialProgress: boolean;
  lastProgressUpdate?: DownloadProgress;
}

/**
 * Default configuration for download speed tracking
 */
export const DEFAULT_DOWNLOAD_CONFIG: DownloadConfig = {
  speedSmoothingFactor: 0.1, // Higher = more responsive, lower = smoother
  minSamplesForEta: 6, // Minimum progress updates before showing stable ETA
  progressDebounceMs: 150, // Debounce progress updates to reduce UI jitter (must be < progressInterval)
  progressInterval: 300, // Update progress every 300ms
};

/**
 * Create a new speed tracker instance
 */
export function createSpeedTracker(): DownloadSpeedTracker {
  return {
    smoothedSpeed: 0,
    sampleCount: 0,
    lastUpdateTime: Date.now(),
    lastBytesDownloaded: 0,
    hasShownInitialProgress: false,
  };
}

/**
 * Calculate smoothed download speed using exponential moving average
 */
export function calculateSmoothedSpeed(
  speedTracker: DownloadSpeedTracker,
  currentBytesDownloaded: number,
  currentTime: number,
  config: DownloadConfig = DEFAULT_DOWNLOAD_CONFIG
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
      (config.speedSmoothingFactor * instantSpeed) +
      ((1 - config.speedSmoothingFactor) * speedTracker.smoothedSpeed);
  }

  speedTracker.sampleCount++;
  speedTracker.lastUpdateTime = currentTime;
  speedTracker.lastBytesDownloaded = currentBytesDownloaded;

  return speedTracker.smoothedSpeed;
}

/**
 * Clear any pending debounce timer
 */
export function clearDebounceTimer(speedTracker: DownloadSpeedTracker): void {
  if (speedTracker.debounceTimer) {
    clearTimeout(speedTracker.debounceTimer);
    speedTracker.debounceTimer = undefined;
  }
}
