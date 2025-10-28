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
export function formatTimeRemainingInDownload(
  bytesRemaining: number,
  bytesPerSecond: number,
  minSamplesForEta: number = 3,
  sampleCount: number = minSamplesForEta
): string {
  if (bytesPerSecond === 0 || sampleCount < minSamplesForEta) {
    return 'Calculating...';
  }

  const secondsRemaining = bytesRemaining / bytesPerSecond;

  return formatTimeRemaining(secondsRemaining);
}

/**
 * Format time remaining for display (e.g., "1m", "2h 30m")
 * @param seconds - Time in seconds
 * @returns Time in HH:MM:SS or MM:SS format
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Format time in HH:MM:SS or MM:SS format
 * @param seconds - Time in seconds
 * @returns Time in HH:MM:SS or MM:SS format
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
