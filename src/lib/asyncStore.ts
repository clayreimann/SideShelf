import AsyncStorage from "@react-native-async-storage/async-storage";

export const ASYNC_KEYS = {
  currentTrack: "abs.currentTrack",
  playbackRate: "abs.playbackRate",
  volume: "abs.volume",
  position: "abs.position",
  isPlaying: "abs.isPlaying",
  currentPlaySessionId: "abs.currentPlaySessionId",
  username: "abs.username",
  sleepTimer: "abs.sleepTimer",
};

export async function saveItem(key: string, value: any): Promise<void> {
  try {
    if (value === null || value === undefined) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.error(`[asyncStore] Failed to save item ${key}:`, error);
    throw error;
  }
}

export async function getItem(key: string): Promise<any> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error(`[asyncStore] Failed to get item ${key}:`, error);
    return null;
  }
}

/**
 * Clear all async storage used by the app
 * Uses getAllKeys() to ensure we don't miss any keys, even if they're added in the future
 *
 * This clears all keys with our app's prefixes:
 * - "abs." (player state, user data, library settings, sort configs)
 * - "@app/" (app settings like jump intervals, smart rewind, diagnostics)
 * - "@logger/" (logger state like error acknowledgment timestamps)
 */
export async function clearAllAsyncStorage(): Promise<void> {
  console.log("[asyncStore] Clearing all async storage...");

  try {
    // Get all keys from AsyncStorage
    const allKeys = await AsyncStorage.getAllKeys();

    // Filter to only our app's keys (those starting with our prefixes)
    const appKeys = allKeys.filter(
      (key) => key.startsWith("abs.") || key.startsWith("@app/") || key.startsWith("@logger/")
    );

    console.log(`[asyncStore] Found ${appKeys.length} app keys to clear:`, appKeys);

    if (appKeys.length > 0) {
      await AsyncStorage.multiRemove(appKeys);
    }

    console.log("[asyncStore] Async storage cleared successfully");
  } catch (error) {
    console.error("[asyncStore] Failed to clear async storage:", error);
    throw error;
  }
}
