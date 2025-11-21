/**
 * iCloud Backup Exclusion Module
 *
 * This module provides utilities to exclude files and directories from iCloud backup on iOS.
 * On Android and other platforms, these operations will be no-ops.
 *
 * Usage:
 * ```typescript
 * import { setExcludeFromBackup, isExcludedFromBackup } from '@/lib/iCloudBackupExclusion';
 *
 * // Exclude a directory from iCloud backup
 * await setExcludeFromBackup('/path/to/downloads');
 *
 * // Check if a file is excluded
 * const { excluded } = await isExcludedFromBackup('/path/to/file');
 * ```
 */

import { NativeModules, Platform } from "react-native";

// Type definitions for the native module
interface ICloudBackupExclusionModule {
  setExcludeFromBackup(
    filePath: string
  ): Promise<{ success: boolean; path: string }>;
  isExcludedFromBackup(
    filePath: string
  ): Promise<{ excluded: boolean; path: string }>;
}

// Get the native module (only available on iOS)
const NativeModule: ICloudBackupExclusionModule | null =
  Platform.OS === "ios" ? NativeModules.ICloudBackupExclusion : null;

/**
 * Sets the "do not back up" attribute on a file or directory
 *
 * This prevents the file or directory from being backed up to iCloud.
 * Useful for large cache files, downloaded media, and other data that
 * can be re-downloaded or regenerated.
 *
 * @param filePath - Absolute path to the file or directory
 * @returns Promise that resolves with success status and path
 * @throws Error if the operation fails on iOS
 */
export async function setExcludeFromBackup(
  filePath: string
): Promise<{ success: boolean; path: string }> {
  if (Platform.OS !== "ios") {
    // On non-iOS platforms, this is a no-op
    return { success: true, path: filePath };
  }

  if (!NativeModule) {
    throw new Error(
      "ICloudBackupExclusion native module is not available on this platform"
    );
  }

  try {
    const result = await NativeModule.setExcludeFromBackup(filePath);
    return result;
  } catch (error) {
    throw new Error(
      `Failed to exclude from backup: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Checks if a file or directory is excluded from iCloud backup
 *
 * @param filePath - Absolute path to the file or directory
 * @returns Promise that resolves with exclusion status and path
 * @throws Error if the operation fails on iOS
 */
export async function isExcludedFromBackup(
  filePath: string
): Promise<{ excluded: boolean; path: string }> {
  if (Platform.OS !== "ios") {
    // On non-iOS platforms, always return false
    return { excluded: false, path: filePath };
  }

  if (!NativeModule) {
    throw new Error(
      "ICloudBackupExclusion native module is not available on this platform"
    );
  }

  try {
    const result = await NativeModule.isExcludedFromBackup(filePath);
    return result;
  } catch (error) {
    throw new Error(
      `Failed to check backup status: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Checks if the iCloud backup exclusion feature is available on the current platform
 *
 * @returns true if running on iOS and the native module is available
 */
export function isICloudBackupExclusionAvailable(): boolean {
  return Platform.OS === "ios" && NativeModule !== null;
}
