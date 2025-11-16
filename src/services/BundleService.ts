/**
 * Bundle Service
 *
 * Wrapper around expo-updates for OTA (Over-The-Air) bundle loading.
 * Provides a simplified interface for checking, downloading, and applying
 * JavaScript updates without requiring a full app rebuild.
 *
 * All updates are managed by expo-updates, which:
 * - Fetches update manifests from configured server (GitHub Pages, EAS, or custom)
 * - Validates bundle integrity and runtime version compatibility
 * - Downloads bundles and assets
 * - Applies updates on next app reload
 *
 * Update server URL is configured at build time in app.config.js.
 * See docs/architecture/OTA_UPDATES.md for details.
 */

import { logger } from "@/lib/logger";
import * as Updates from "expo-updates";

const log = logger.forTag("BundleService");

/**
 * Bundle Service
 *
 * Handles checking for and applying OTA updates via expo-updates
 */
class BundleServiceImpl {
  /**
   * Check if expo-updates is available in this build
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
   * Check for available updates from the configured update server
   *
   * The update server URL is configured at build time in app.config.js
   * via the EXPO_PUBLIC_UPDATE_URL environment variable.
   *
   * @returns Update availability and manifest if available
   */
  async checkForUpdate(): Promise<{
    isAvailable: boolean;
    manifest?: Updates.Manifest;
  }> {
    try {
      if (!Updates.isEnabled) {
        log.warn("Updates are not enabled in this build");
        return { isAvailable: false };
      }

      log.info("Checking for updates from configured server...");

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
   * Downloads the update in the background. Once complete,
   * the update will be applied on next app reload.
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
   *
   * This will immediately restart the app and load the new bundle.
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
   * Set a custom update URL at runtime
   *
   * This requires the build to have expo.updates.disableAntiBrickingMeasures: true
   * in app.config.js. The new URL will only be used after the app is killed and relaunched.
   *
   * Note: This disables embedded update fallback, so use with caution.
   * Intended for preview/TestFlight builds only.
   *
   * @param url The new update URL
   */
  async setUpdateURL(url: string): Promise<void> {
    try {
      if (!Updates.isEnabled) {
        throw new Error("Updates are not enabled in this build");
      }

      log.info(`Setting update URL override to: ${url}`);
      await Updates.setUpdateURLAndRequestHeadersOverride({
        updateUrl: url,
        requestHeaders: {},
      });
    } catch (error) {
      log.error("Failed to set update URL", error as Error);
      throw error;
    }
  }

  /**
   * Set custom request headers for update requests
   *
   * This allows changing the channel (or other headers) without changing the URL.
   * Safer than URL override as it doesn't require disableAntiBrickingMeasures.
   *
   * @param headers Headers to set, or null to clear overrides
   */
  async setUpdateRequestHeaders(headers: Record<string, string> | null): Promise<void> {
    try {
      if (!Updates.isEnabled) {
        throw new Error("Updates are not enabled in this build");
      }

      log.info("Setting update request header overrides:", headers);
      await Updates.setUpdateRequestHeadersOverride(headers);
    } catch (error) {
      log.error("Failed to set update request headers", error as Error);
      throw error;
    }
  }
}

export const bundleService = new BundleServiceImpl();
