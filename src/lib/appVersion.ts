/**
 * App Version Tracking Utility
 *
 * Helps detect when the app has been updated by comparing the current version
 * with a previously stored version. This is useful for triggering cleanup or
 * re-initialization logic after app updates.
 */

import { logger } from '@/lib/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

const log = logger.forTag('AppVersion');

const VERSION_KEY = '@app/version';
const BUILD_NUMBER_KEY = '@app/build_number';

/**
 * Get the current app version
 */
export function getCurrentVersion(): string {
  return DeviceInfo.getVersion();
}

/**
 * Get the current build number
 */
export function getCurrentBuildNumber(): string {
  return DeviceInfo.getBuildNumber();
}

/**
 * Get the full version string (version + build number)
 */
export function getFullVersionString(): string {
  return `${getCurrentVersion()} (${getCurrentBuildNumber()})`;
}

/**
 * Check if the app has been updated since last run
 * Returns true if this is a new version or first run
 */
export async function hasAppBeenUpdated(): Promise<boolean> {
  try {
    const currentVersion = getCurrentVersion();
    const currentBuildNumber = getCurrentBuildNumber();

    const [storedVersion, storedBuildNumber] = await Promise.all([
      AsyncStorage.getItem(VERSION_KEY),
      AsyncStorage.getItem(BUILD_NUMBER_KEY),
    ]);

    // First run - no stored version
    if (!storedVersion || !storedBuildNumber) {
      log.info(`First run detected - current version: ${getFullVersionString()}`);
      return true;
    }

    // Check if version or build number changed
    const versionChanged = storedVersion !== currentVersion;
    const buildChanged = storedBuildNumber !== currentBuildNumber;

    if (versionChanged || buildChanged) {
      log.info(
        `App updated detected: ${storedVersion} (${storedBuildNumber}) -> ${currentVersion} (${currentBuildNumber})`
      );
      return true;
    }

    log.debug(`Same version as last run: ${getFullVersionString()}`);
    return false;
  } catch (error) {
    log.error('Failed to check app version', error as Error);
    // Assume not updated on error
    return false;
  }
}

/**
 * Save the current version as the "last known version"
 * Call this after handling any update logic
 */
export async function saveCurrentVersion(): Promise<void> {
  try {
    const currentVersion = getCurrentVersion();
    const currentBuildNumber = getCurrentBuildNumber();

    await Promise.all([
      AsyncStorage.setItem(VERSION_KEY, currentVersion),
      AsyncStorage.setItem(BUILD_NUMBER_KEY, currentBuildNumber),
    ]);

    log.info(`Saved current version: ${getFullVersionString()}`);
  } catch (error) {
    log.error('Failed to save app version', error as Error);
  }
}

/**
 * Get the previously stored version (if any)
 */
export async function getPreviousVersion(): Promise<{ version: string; buildNumber: string } | null> {
  try {
    const [version, buildNumber] = await Promise.all([
      AsyncStorage.getItem(VERSION_KEY),
      AsyncStorage.getItem(BUILD_NUMBER_KEY),
    ]);

    if (!version || !buildNumber) {
      return null;
    }

    return { version, buildNumber };
  } catch (error) {
    log.error('Failed to get previous version', error as Error);
    return null;
  }
}
