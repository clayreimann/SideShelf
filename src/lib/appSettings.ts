/**
 * App Settings Module
 *
 * Manages user preferences and app settings stored in AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEYS = {
  enableBackgroundServiceReconnection: '@app/enableBackgroundServiceReconnection',
} as const;

/**
 * Get whether background service auto-reconnection is enabled
 * Default: true (enabled)
 */
export async function getBackgroundServiceReconnectionEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(SETTINGS_KEYS.enableBackgroundServiceReconnection);
    // Default to true if not set
    return value === null ? true : value === 'true';
  } catch (error) {
    console.error('[AppSettings] Failed to get background service reconnection setting:', error);
    return true; // Default to enabled on error
  }
}

/**
 * Set whether background service auto-reconnection is enabled
 */
export async function setBackgroundServiceReconnectionEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SETTINGS_KEYS.enableBackgroundServiceReconnection,
      enabled ? 'true' : 'false'
    );
  } catch (error) {
    console.error('[AppSettings] Failed to save background service reconnection setting:', error);
    throw error;
  }
}
