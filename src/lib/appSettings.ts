/**
 * App Settings Module
 *
 * Manages user preferences and app settings stored in AsyncStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEYS = {
  jumpForwardInterval: "@app/jumpForwardInterval",
  jumpBackwardInterval: "@app/jumpBackwardInterval",
  enableSmartRewind: "@app/enableSmartRewind",
  enablePeriodicNowPlayingUpdates: "@app/enablePeriodicNowPlayingUpdates",
  homeLayout: "@app/homeLayout",
  enableDiagnostics: "@app/enableDiagnostics",
  showAllLibraries: "@app/showAllLibraries",
  showAllPodcastLibraries: "@app/showAllPodcastLibraries",
} as const;

// Default values
const DEFAULT_JUMP_FORWARD_INTERVAL = 30;
const DEFAULT_JUMP_BACKWARD_INTERVAL = 15;
const DEFAULT_SMART_REWIND_ENABLED = true;
const DEFAULT_PERIODIC_NOW_PLAYING_UPDATES_ENABLED = true;
const DEFAULT_HOME_LAYOUT = "list" as const;
const DEFAULT_DIAGNOSTICS_ENABLED = false;
const DEFAULT_SHOW_ALL_LIBRARIES = false;
const DEFAULT_SHOW_ALL_PODCAST_LIBRARIES = false;

/**
 * Get jump forward interval in seconds
 * Default: 30 seconds
 */
export async function getJumpForwardInterval(): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.jumpForwardInterval);
    if (value === null) return DEFAULT_JUMP_FORWARD_INTERVAL;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? DEFAULT_JUMP_FORWARD_INTERVAL : parsed;
  } catch (error) {
    console.error("[AppSettings] Failed to get jump forward interval:", error);
    return DEFAULT_JUMP_FORWARD_INTERVAL;
  }
}

/**
 * Set jump forward interval in seconds
 */
export async function setJumpForwardInterval(seconds: number): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.jumpForwardInterval, seconds.toString());
  } catch (error) {
    console.error("[AppSettings] Failed to save jump forward interval:", error);
    throw error;
  }
}

/**
 * Get jump backward interval in seconds
 * Default: 15 seconds
 */
export async function getJumpBackwardInterval(): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.jumpBackwardInterval);
    if (value === null) return DEFAULT_JUMP_BACKWARD_INTERVAL;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? DEFAULT_JUMP_BACKWARD_INTERVAL : parsed;
  } catch (error) {
    console.error("[AppSettings] Failed to get jump backward interval:", error);
    return DEFAULT_JUMP_BACKWARD_INTERVAL;
  }
}

/**
 * Set jump backward interval in seconds
 */
export async function setJumpBackwardInterval(seconds: number): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.jumpBackwardInterval, seconds.toString());
  } catch (error) {
    console.error("[AppSettings] Failed to save jump backward interval:", error);
    throw error;
  }
}

/**
 * Get whether smart rewind is enabled
 * Default: true (enabled)
 */
export async function getSmartRewindEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.enableSmartRewind);
    return value === null ? DEFAULT_SMART_REWIND_ENABLED : value === "true";
  } catch (error) {
    console.error("[AppSettings] Failed to get smart rewind setting:", error);
    return DEFAULT_SMART_REWIND_ENABLED;
  }
}

/**
 * Set whether smart rewind is enabled
 */
export async function setSmartRewindEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.enableSmartRewind, enabled ? "true" : "false");
  } catch (error) {
    console.error("[AppSettings] Failed to save smart rewind setting:", error);
    throw error;
  }
}

/**
 * Get whether periodic now playing metadata updates are enabled
 * Default: true (enabled)
 */
export async function getPeriodicNowPlayingUpdatesEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.enablePeriodicNowPlayingUpdates);
    return value === null ? DEFAULT_PERIODIC_NOW_PLAYING_UPDATES_ENABLED : value === "true";
  } catch (error) {
    console.error("[AppSettings] Failed to get periodic now playing updates setting:", error);
    return DEFAULT_PERIODIC_NOW_PLAYING_UPDATES_ENABLED;
  }
}

/**
 * Set whether periodic now playing metadata updates are enabled
 */
export async function setPeriodicNowPlayingUpdatesEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SETTINGS_KEYS.enablePeriodicNowPlayingUpdates,
      enabled ? "true" : "false"
    );
  } catch (error) {
    console.error("[AppSettings] Failed to save periodic now playing updates setting:", error);
    throw error;
  }
}

/**
 * Get home screen layout preference
 * Default: 'list' (vertical list layout)
 */
export async function getHomeLayout(): Promise<"list" | "cover"> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.homeLayout);
    return value === "cover" ? "cover" : DEFAULT_HOME_LAYOUT;
  } catch (error) {
    console.error("[AppSettings] Failed to get home layout setting:", error);
    return DEFAULT_HOME_LAYOUT;
  }
}

/**
 * Set home screen layout preference
 */
export async function setHomeLayout(layout: "list" | "cover"): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.homeLayout, layout);
  } catch (error) {
    console.error("[AppSettings] Failed to save home layout setting:", error);
    throw error;
  }
}

/**
 * Get whether diagnostics mode is enabled
 * Default: false (disabled)
 */
export async function getDiagnosticsEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.enableDiagnostics);
    return value === null ? DEFAULT_DIAGNOSTICS_ENABLED : value === "true";
  } catch (error) {
    console.error("[AppSettings] Failed to get diagnostics setting:", error);
    return DEFAULT_DIAGNOSTICS_ENABLED;
  }
}

/**
 * Set whether diagnostics mode is enabled
 */
export async function setDiagnosticsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.enableDiagnostics, enabled ? "true" : "false");
  } catch (error) {
    console.error("[AppSettings] Failed to save diagnostics setting:", error);
    throw error;
  }
}

/**
 * Get whether to show all book libraries
 * Default: false (show one selected library)
 */
export async function getShowAllLibraries(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.showAllLibraries);
    return value === null ? DEFAULT_SHOW_ALL_LIBRARIES : value === "true";
  } catch (error) {
    console.error("[AppSettings] Failed to get show all libraries setting:", error);
    return DEFAULT_SHOW_ALL_LIBRARIES;
  }
}

/**
 * Set whether to show all book libraries
 */
export async function setShowAllLibraries(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.showAllLibraries, enabled ? "true" : "false");
  } catch (error) {
    console.error("[AppSettings] Failed to save show all libraries setting:", error);
    throw error;
  }
}

/**
 * Get whether to show all podcast libraries
 * Default: false (show one selected podcast library)
 */
export async function getShowAllPodcastLibraries(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.showAllPodcastLibraries);
    return value === null ? DEFAULT_SHOW_ALL_PODCAST_LIBRARIES : value === "true";
  } catch (error) {
    console.error("[AppSettings] Failed to get show all podcast libraries setting:", error);
    return DEFAULT_SHOW_ALL_PODCAST_LIBRARIES;
  }
}

/**
 * Set whether to show all podcast libraries
 */
export async function setShowAllPodcastLibraries(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.showAllPodcastLibraries, enabled ? "true" : "false");
  } catch (error) {
    console.error("[AppSettings] Failed to save show all podcast libraries setting:", error);
    throw error;
  }
}

/**
 * Calculate smart rewind time based on how long playback has been paused
 * Based on the audiobookshelf-app implementation
 *
 * @param lastPlayedMs - Timestamp (in milliseconds) when playback was last active.
 *   This can be from the current session's pause time (in-memory) or from
 *   the most recent of activeSession.updatedAt or savedProgress.lastUpdate (from database).
 * @returns Number of seconds to rewind
 */
export function calculateSmartRewindTime(lastPlayedMs: number | null): number {
  if (!lastPlayedMs) return 0;

  const now = Date.now();
  const timeSinceLastPlayed = (now - lastPlayedMs) / 1000; // Convert to seconds

  if (timeSinceLastPlayed < 10) return 0; // 10s or less = no rewind
  if (timeSinceLastPlayed < 60) return 3; // 10s to 1m = rewind 3s
  if (timeSinceLastPlayed < 300) return 10; // 1m to 5m = rewind 10s
  if (timeSinceLastPlayed < 1800) return 20; // 5m to 30m = rewind 20s
  return 30; // 30m and up = rewind 30s
}
