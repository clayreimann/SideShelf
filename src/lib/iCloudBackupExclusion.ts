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
  setExcludeFromBackup(filePath: string): Promise<{ success: boolean; path: string }>;
  isExcludedFromBackup(filePath: string): Promise<{ excluded: boolean; path: string }>;
}

// Get the native module (only available on iOS)
const NativeModule: ICloudBackupExclusionModule | null =
  Platform.OS === "ios" ? NativeModules.ICloudBackupExclusion : null;

/**
 * Normalize a path for the native module.
 *
 * The native setxattr call uses fileSystemRepresentation, which operates on
 * raw filesystem bytes without percent-decoding. Files downloaded by the
 * background downloader are saved using the percent-encoded URI path directly
 * (the downloader strips "file://" and passes the remaining string as a POSIX
 * path), so filenames like "Book%20Title.m4b" exist on disk with literal %20.
 *
 * We must NOT decode percent-encoding here — we only strip the "file://" scheme.
 */
function normalizePath(filePath: string): string {
  if (filePath.startsWith("file://")) {
    return filePath.slice("file://".length);
  }
  return filePath;
}

/**
 * Sets the "do not back up" attribute on a file or directory
 *
 * This prevents the file or directory from being backed up to iCloud.
 * Useful for large cache files, downloaded media, and other data that
 * can be re-downloaded or regenerated.
 *
 * @param filePath - Absolute path or file:// URL to the file or directory
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
    throw new Error("ICloudBackupExclusion native module is not available on this platform");
  }

  try {
    const result = await NativeModule.setExcludeFromBackup(normalizePath(filePath));
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
    throw new Error("ICloudBackupExclusion native module is not available on this platform");
  }

  try {
    const result = await NativeModule.isExcludedFromBackup(normalizePath(filePath));
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
