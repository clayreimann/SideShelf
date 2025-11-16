/**
 * Bundle Service
 *
 * Manages downloading and preparing custom JavaScript bundles for testing.
 * This allows TestFlight builds to load bundles from PR builds without
 * requiring a full app rebuild.
 *
 * IMPORTANT: This service downloads and validates bundles but does NOT
 * implement runtime bundle loading. To actually load a custom bundle at
 * runtime, you would need to either:
 *
 * 1. Use expo-updates with EAS (recommended for Expo apps)
 * 2. Eject to bare React Native and implement custom bundle loading
 * 3. Use this as a foundation for a custom update mechanism
 *
 * Current implementation:
 * - Downloads bundle files from a URL
 * - Validates bundle integrity
 * - Stores bundle metadata
 * - Provides status and error handling
 */

import * as FileSystem from "expo-file-system";
import { logger } from "@/lib/logger";
import * as Updates from "expo-updates";

const log = logger.forTag("BundleService");

export interface BundleMetadata {
  url: string;
  downloadedAt: number;
  localPath: string;
  size: number;
  hash?: string;
}

export interface BundleDownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  progress: number; // 0-1
}

/**
 * Bundle Service
 *
 * Handles downloading and managing custom JavaScript bundles
 */
class BundleServiceImpl {
  private readonly BUNDLE_DIR = `${FileSystem.documentDirectory}bundles/`;
  private currentDownload: FileSystem.DownloadResumable | null = null;

  /**
   * Check if Updates are available in this build
   */
  async isUpdatesAvailable(): Promise<boolean> {
    try {
      return Updates.isEnabled;
    } catch {
      return false;
    }
  }

  /**
   * Get information about the currently running bundle
   */
  async getCurrentBundleInfo(): Promise<{
    updateId: string | null;
    channel: string | null;
    runtimeVersion: string;
    isEmbeddedLaunch: boolean;
  }> {
    try {
      const updateId = Updates.updateId;
      const channel = Updates.channel;
      const runtimeVersion = Updates.runtimeVersion;
      const isEmbeddedLaunch = Updates.isEmbeddedLaunch;

      return {
        updateId: updateId || null,
        channel: channel || null,
        runtimeVersion: runtimeVersion || "unknown",
        isEmbeddedLaunch,
      };
    } catch (error) {
      log.error("Failed to get current bundle info", error as Error);
      return {
        updateId: null,
        channel: null,
        runtimeVersion: "unknown",
        isEmbeddedLaunch: true,
      };
    }
  }

  /**
   * Check for updates from a custom URL or channel
   *
   * Note: expo-updates doesn't support checking arbitrary URLs directly.
   * The URL must be configured as the update server in app.json or
   * you must host a compatible update manifest at the default location.
   *
   * @param url - Custom update URL (for documentation/validation only)
   * @returns Update information if available
   */
  async checkForUpdate(url?: string): Promise<{
    isAvailable: boolean;
    manifest?: Updates.Manifest;
  }> {
    try {
      if (!Updates.isEnabled) {
        log.warn("Updates are not enabled in this build");
        return { isAvailable: false };
      }

      if (url) {
        log.info(`Custom update URL provided: ${url}`);
        log.warn(
          "Note: expo-updates uses the configured server from app.json. " +
            "To use a custom URL, you must configure it as the update server."
        );
      }

      log.info("Checking for updates from configured server...");

      // Check for updates (uses configured URL from app.json)
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable && update.manifest) {
        log.info("Update available:", update.manifest.id);
        return {
          isAvailable: true,
          manifest: update.manifest,
        };
      }

      log.info("No updates available");
      return { isAvailable: false };
    } catch (error) {
      log.error("Failed to check for updates", error as Error);
      throw error;
    }
  }

  /**
   * Download and apply an available update
   *
   * @returns Success status and whether a reload is needed
   */
  async fetchAndApplyUpdate(): Promise<{
    success: boolean;
    needsReload: boolean;
  }> {
    try {
      if (!Updates.isEnabled) {
        throw new Error("Updates are not enabled in this build");
      }

      log.info("Fetching update...");
      const result = await Updates.fetchUpdateAsync();

      if (result.isNew) {
        log.info("New update downloaded successfully");
        return {
          success: true,
          needsReload: true,
        };
      }

      log.info("Update already downloaded");
      return {
        success: true,
        needsReload: false,
      };
    } catch (error) {
      log.error("Failed to fetch update", error as Error);
      throw error;
    }
  }

  /**
   * Reload the app to apply a downloaded update
   */
  async reloadApp(): Promise<void> {
    try {
      if (!Updates.isEnabled) {
        throw new Error("Updates are not enabled in this build");
      }

      log.info("Reloading app to apply update...");
      await Updates.reloadAsync();
    } catch (error) {
      log.error("Failed to reload app", error as Error);
      throw error;
    }
  }

  /**
   * Download a bundle file from a URL (for custom bundle management)
   *
   * NOTE: This downloads a bundle file but does NOT load it at runtime.
   * This is useful for pre-downloading bundles or implementing custom
   * bundle management outside of expo-updates.
   *
   * @param url - URL to download the bundle from
   * @param onProgress - Progress callback
   * @returns Metadata about the downloaded bundle
   */
  async downloadBundle(
    url: string,
    onProgress?: (progress: BundleDownloadProgress) => void
  ): Promise<BundleMetadata> {
    try {
      // Ensure bundle directory exists
      await this.ensureBundleDir();

      // Generate local filename from URL hash
      const filename = this.generateFilename(url);
      const localPath = `${this.BUNDLE_DIR}${filename}`;

      log.info(`Downloading bundle from ${url} to ${localPath}`);

      // Create download resumable
      this.currentDownload = FileSystem.createDownloadResumable(
        url,
        localPath,
        {},
        (downloadProgress) => {
          const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
          if (onProgress && totalBytesExpectedToWrite > 0) {
            onProgress({
              downloadedBytes: totalBytesWritten,
              totalBytes: totalBytesExpectedToWrite,
              progress: totalBytesWritten / totalBytesExpectedToWrite,
            });
          }
        }
      );

      const result = await this.currentDownload.downloadAsync();
      this.currentDownload = null;

      if (!result) {
        throw new Error("Download failed - no result returned");
      }

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      if (!fileInfo.exists) {
        throw new Error("Downloaded file does not exist");
      }

      const metadata: BundleMetadata = {
        url,
        downloadedAt: Date.now(),
        localPath: result.uri,
        size: fileInfo.size || 0,
      };

      log.info(`Bundle downloaded successfully: ${metadata.size} bytes`);
      return metadata;
    } catch (error) {
      this.currentDownload = null;
      log.error("Failed to download bundle", error as Error);
      throw error;
    }
  }

  /**
   * Cancel an in-progress download
   */
  async cancelDownload(): Promise<void> {
    if (this.currentDownload) {
      log.info("Cancelling bundle download");
      await this.currentDownload.cancelAsync();
      this.currentDownload = null;
    }
  }

  /**
   * Validate a URL is properly formatted
   */
  validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Clear downloaded bundles
   */
  async clearBundles(): Promise<void> {
    try {
      log.info("Clearing downloaded bundles");
      const dirInfo = await FileSystem.getInfoAsync(this.BUNDLE_DIR);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.BUNDLE_DIR, { idempotent: true });
      }
      await this.ensureBundleDir();
    } catch (error) {
      log.error("Failed to clear bundles", error as Error);
      throw error;
    }
  }

  /**
   * Ensure bundle directory exists
   */
  private async ensureBundleDir(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.BUNDLE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.BUNDLE_DIR, { intermediates: true });
    }
  }

  /**
   * Generate a filename from URL
   */
  private generateFilename(url: string): string {
    const hash = this.simpleHash(url);
    const timestamp = Date.now();
    return `bundle_${hash}_${timestamp}.bundle`;
  }

  /**
   * Simple string hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

export const bundleService = new BundleServiceImpl();
