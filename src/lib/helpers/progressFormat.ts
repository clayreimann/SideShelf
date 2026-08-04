/**
 * Progress display format type.
 * Used by the player UI and settings to select how playback progress is shown.
 */
export type ProgressFormat = "remaining" | "elapsed" | "percent";

/**
 * Format seconds into a clock string: H:MM:SS or M:SS.
 * When `forceHours` is true, always includes the hours component (e.g. "0:01:00").
 */
function formatClock(seconds: number, forceHours: boolean = false): string {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0 || forceHours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format seconds into a friendly duration string using hours and minutes only.
 * Examples: "2h 21m", "45m", "0m"
 */
function formatFriendlyDuration(seconds: number): string {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format playback progress for display.
 *
 * @param format - The display format to use
 * @param positionSecs - Current playback position in seconds
 * @param durationSecs - Total duration in seconds
 * @returns Formatted progress string
 *
 * @example
 * formatProgress('remaining', 5025, 13530) // "2h 21m remaining"
 * formatProgress('elapsed', 5025, 13530)   // "1:23:45 / 3:45:30"
 * formatProgress('percent', 5025, 13530)   // "37%"
 */
export function formatProgress(
  format: ProgressFormat,
  positionSecs: number,
  durationSecs: number
): string {
  switch (format) {
    case "remaining": {
      if (durationSecs <= 0) {
        return "0m remaining";
      }
      const remaining = Math.max(0, durationSecs - positionSecs);
      return `${formatFriendlyDuration(remaining)} remaining`;
    }

    case "elapsed": {
      const durationHasHours = durationSecs >= 3600;
      const positionStr = formatClock(positionSecs, durationHasHours);
      const durationStr = formatClock(durationSecs, false);
      return `${positionStr} / ${durationStr}`;
    }

    case "percent": {
      if (durationSecs <= 0) {
        return "0%";
      }
      const ratio = positionSecs / durationSecs;
      const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
      return `${percent}%`;
    }
  }
}
