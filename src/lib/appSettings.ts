/**
 * App Settings Module
 *
 * Manages user preferences and app settings stored in AsyncStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ProgressFormat } from "@/lib/helpers/progressFormat";

const SETTINGS_KEYS = {
  jumpForwardInterval: "@app/jumpForwardInterval",
  jumpBackwardInterval: "@app/jumpBackwardInterval",
  enableSmartRewind: "@app/enableSmartRewind",
  enablePeriodicNowPlayingUpdates: "@app/enablePeriodicNowPlayingUpdates",
  homeLayout: "@app/homeLayout",
  enableDiagnostics: "@app/enableDiagnostics",
  tabOrder: "@app/tabOrder",
  hiddenTabs: "@app/hiddenTabs",
  customUpdateUrl: "@app/customUpdateUrl",
  lastHomeSectionCount: "@app/lastHomeSectionCount",
  viewMode: "@app/viewMode",
  progressFormat: "@app/progressFormat",
  chapterBarShowRemaining: "@app/chapterBarShowRemaining",
  keepScreenAwake: "@app/keepScreenAwake",
  bookmarkTitleMode: "@app/bookmarkTitleMode",
} as const;

const DEFAULT_PROGRESS_FORMAT = "remaining" as const satisfies ProgressFormat;

// Default values
const DEFAULT_JUMP_FORWARD_INTERVAL = 30;
const DEFAULT_JUMP_BACKWARD_INTERVAL = 15;
const DEFAULT_SMART_REWIND_ENABLED = true;
const DEFAULT_PERIODIC_NOW_PLAYING_UPDATES_ENABLED = true;
const DEFAULT_HOME_LAYOUT = "list" as const;
const DEFAULT_DIAGNOSTICS_ENABLED = false;
const DEFAULT_TAB_ORDER = ["home", "library", "series", "authors", "more"];
const DEFAULT_HIDDEN_TABS: string[] = [];

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
 * Get custom update URL for loading test bundles
 * Default: null (no custom update URL)
 */
export async function getCustomUpdateUrl(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.customUpdateUrl);
    return value;
  } catch (error) {
    console.error("[AppSettings] Failed to get custom update URL:", error);
    return null;
  }
}

/**
 * Set custom update URL for loading test bundles
 */
export async function setCustomUpdateUrl(url: string | null): Promise<void> {
  try {
    if (url === null || url === "") {
      await AsyncStorage.removeItem(SETTINGS_KEYS.customUpdateUrl);
    } else {
      await AsyncStorage.setItem(SETTINGS_KEYS.customUpdateUrl, url);
    }
  } catch (error) {
    console.error("[AppSettings] Failed to save custom update URL:", error);
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

/**
 * Get tab order preference
 * Default: ["home", "library", "series", "authors", "more"]
 */
export async function getTabOrder(): Promise<string[]> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.tabOrder);
    if (value === null) return DEFAULT_TAB_ORDER;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : DEFAULT_TAB_ORDER;
  } catch (error) {
    console.error("[AppSettings] Failed to get tab order:", error);
    return DEFAULT_TAB_ORDER;
  }
}

/**
 * Set tab order preference
 */
export async function setTabOrder(order: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.tabOrder, JSON.stringify(order));
  } catch (error) {
    console.error("[AppSettings] Failed to save tab order:", error);
    throw error;
  }
}

/**
 * Get hidden tabs preference
 * Default: [] (no tabs hidden)
 */
export async function getHiddenTabs(): Promise<string[]> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.hiddenTabs);
    if (value === null) return DEFAULT_HIDDEN_TABS;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : DEFAULT_HIDDEN_TABS;
  } catch (error) {
    console.error("[AppSettings] Failed to get hidden tabs:", error);
    return DEFAULT_HIDDEN_TABS;
  }
}

/**
 * Set hidden tabs preference
 */
export async function setHiddenTabs(hiddenTabs: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.hiddenTabs, JSON.stringify(hiddenTabs));
  } catch (error) {
    console.error("[AppSettings] Failed to save hidden tabs:", error);
    throw error;
  }
}

/**
 * Get the number of sections shown on the home screen in the last session.
 * Used to size the skeleton on cold start.
 * Default: 3 (covers most users who have Continue Listening + Downloaded + Listen Again)
 */
export async function getLastHomeSectionCount(): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.lastHomeSectionCount);
    if (value === null) return 3;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 3 : parsed;
  } catch (error) {
    console.error("[AppSettings] Failed to get last home section count:", error);
    return 3;
  }
}

/**
 * Persist the number of sections currently shown on the home screen.
 * Called after home data loads so the next cold start knows how many skeletons to show.
 */
export async function setLastHomeSectionCount(count: number): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.lastHomeSectionCount, count.toString());
  } catch (error) {
    console.error("[AppSettings] Failed to save last home section count:", error);
  }
}

/**
 * Get library view mode preference
 * Default: 'list' (vertical list layout)
 */
export async function getViewMode(): Promise<"list" | "grid"> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.viewMode);
    return value === "grid" ? "grid" : "list";
  } catch (error) {
    console.error("[AppSettings] Failed to get view mode setting:", error);
    return "list";
  }
}

/**
 * Set library view mode preference
 */
export async function setViewMode(mode: "list" | "grid"): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.viewMode, mode);
  } catch (error) {
    console.error("[AppSettings] Failed to save view mode setting:", error);
    throw error;
  }
}

/**
 * Get progress display format preference
 * Default: 'remaining' — shows time remaining (e.g. "2h 21m remaining")
 */
export async function getProgressFormat(): Promise<ProgressFormat> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.progressFormat);
    if (value === "remaining" || value === "elapsed" || value === "percent") {
      return value;
    }
    return DEFAULT_PROGRESS_FORMAT;
  } catch (error) {
    console.error("[AppSettings] Failed to get progress format setting:", error);
    return DEFAULT_PROGRESS_FORMAT;
  }
}

/**
 * Set progress display format preference
 */
export async function setProgressFormat(format: ProgressFormat): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.progressFormat, format);
  } catch (error) {
    console.error("[AppSettings] Failed to save progress format setting:", error);
    throw error;
  }
}

const DEFAULT_CHAPTER_BAR_SHOW_REMAINING = false;
const DEFAULT_KEEP_SCREEN_AWAKE = false;

/**
 * Get whether the chapter bar right-label shows time remaining (true) or total duration (false)
 * Default: false (show total duration)
 */
export async function getChapterBarShowRemaining(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.chapterBarShowRemaining);
    return value === null ? DEFAULT_CHAPTER_BAR_SHOW_REMAINING : value === "true";
  } catch (error) {
    console.error("[AppSettings] Failed to get chapter bar show remaining setting:", error);
    return DEFAULT_CHAPTER_BAR_SHOW_REMAINING;
  }
}

/**
 * Set whether the chapter bar right-label shows time remaining or total duration
 */
export async function setChapterBarShowRemaining(showRemaining: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SETTINGS_KEYS.chapterBarShowRemaining,
      showRemaining ? "true" : "false"
    );
  } catch (error) {
    console.error("[AppSettings] Failed to save chapter bar show remaining setting:", error);
    throw error;
  }
}

/**
 * Get whether the screen should stay awake during playback
 * Default: false (allow screen to sleep normally)
 */
export async function getKeepScreenAwake(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.keepScreenAwake);
    return value === null ? DEFAULT_KEEP_SCREEN_AWAKE : value === "true";
  } catch (error) {
    console.error("[AppSettings] Failed to get keep screen awake setting:", error);
    return DEFAULT_KEEP_SCREEN_AWAKE;
  }
}

/**
 * Set whether the screen should stay awake during playback
 */
export async function setKeepScreenAwake(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.keepScreenAwake, enabled ? "true" : "false");
  } catch (error) {
    console.error("[AppSettings] Failed to save keep screen awake setting:", error);
    throw error;
  }
}

/**
 * Get bookmark title mode preference
 * Returns null when the user has never made a choice (triggers first-tap alert in FullScreenPlayer)
 * Default: null (not yet set)
 */
export async function getBookmarkTitleMode(): Promise<"auto" | "prompt" | null> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.bookmarkTitleMode);
    if (value === "prompt") return "prompt";
    if (value === "auto") return "auto";
    return null; // null = user has never made a choice (triggers first-tap alert)
  } catch (error) {
    console.error("[AppSettings] Failed to get bookmark title mode:", error);
    return null;
  }
}

/**
 * Set bookmark title mode preference
 */
export async function setBookmarkTitleMode(mode: "auto" | "prompt"): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEYS.bookmarkTitleMode, mode);
  } catch (error) {
    console.error("[AppSettings] Failed to save bookmark title mode:", error);
    throw error;
  }
}
