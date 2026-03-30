/**
 * BackgroundReconnectCollaborator
 *
 * Concern group: background service reconnection and container path refresh.
 * Handles app updates, hot reloads, and iOS container UUID changes.
 *
 * Circular dependency note: PlayerBackgroundService is required dynamically
 * (via require()) rather than via a static import. This is intentional —
 * PlayerService (which owns this collaborator) and PlayerBackgroundService
 * have a mutual dependency that cannot be resolved with static imports.
 * Pattern documented in CLAUDE.md under "No Circular Imports".
 */

import { getCoverUri } from "@/lib/covers";
import { configureTrackPlayer } from "@/lib/trackPlayerConfig";
import { logger } from "@/lib/logger";
import { updateNowPlayingMetadata } from "@/lib/nowPlayingMetadata";
import { useAppStore } from "@/stores/appStore";
import type { PlayerTrack } from "@/types/player";
import { AppState } from "react-native";
import TrackPlayer from "react-native-track-player";
import type { IBackgroundReconnectCollaborator, IPlayerServiceFacade } from "./types";

const log = logger.forTag("PlayerService");
const diagLog = logger.forDiagnostics("PlayerService");

/**
 * Handles background service reconnection after app updates / hot reloads,
 * and cover URI refresh after iOS container path changes.
 */
export class BackgroundReconnectCollaborator implements IBackgroundReconnectCollaborator {
  constructor(private facade: IPlayerServiceFacade) {}

  /**
   * Reconnect background service after app updates, hot reloads, or JS context recreation.
   * Falls back to full re-registration if the module has changed.
   */
  async reconnectBackgroundService(): Promise<void> {
    try {
      log.info("Reconnecting background service");
      const runtimeParts: string[] = [];
      runtimeParts.push(typeof globalThis.window === "undefined" ? "no-window" : "window");
      runtimeParts.push(typeof globalThis.document === "undefined" ? "no-document" : "document");
      try {
        runtimeParts.push(`AppState=${AppState.currentState ?? "unknown"}`);
      } catch {
        runtimeParts.push("AppState=unavailable");
      }
      diagLog.info(`PlayerService reconnect runtime: ${runtimeParts.join(" ")}`);

      // Try to load the background service module
      // Using require() here to handle dynamic loading
      let PlayerBackgroundServiceModule;

      try {
        // Clear the require cache for this module to ensure we get the latest version
        // This is important after app updates where the module might have changed. Hermes
        // doesn't expose Node's require.resolve / require.cache, so guard their usage.
        const metroRequire = require as {
          resolve?: (path: string) => string;
          cache?: Record<string, unknown>;
        };
        const canResolve =
          typeof require === "function" && typeof metroRequire.resolve === "function";
        const cache = typeof require === "function" ? metroRequire.cache : undefined;

        if (canResolve && metroRequire.resolve) {
          const modulePath = metroRequire.resolve("../PlayerBackgroundService");
          if (__DEV__) {
            log.debug(`Module path: ${modulePath}`);
          }

          // Delete from cache in development to ensure we get fresh code
          if (__DEV__ && cache && cache[modulePath]) {
            log.debug("Clearing module cache for PlayerBackgroundService");
            delete cache[modulePath];
          }
        } else if (__DEV__) {
          log.debug("require.resolve not available; skipping cache clear");
        }

        PlayerBackgroundServiceModule = require("../PlayerBackgroundService");
      } catch (requireError) {
        log.error("Failed to require PlayerBackgroundService module", requireError as Error);

        // If we can't load the module, try to force a full re-registration
        log.warn("Attempting full TrackPlayer service re-registration");
        TrackPlayer.registerPlaybackService(() => require("../PlayerBackgroundService"));
        await configureTrackPlayer();
        return;
      }

      // Check if the reconnect function exists
      const reconnectFn = PlayerBackgroundServiceModule.reconnectBackgroundService;
      const isInitialized = PlayerBackgroundServiceModule.isBackgroundServiceInitialized?.();

      if (typeof reconnectFn === "function") {
        log.info(`Background service initialized: ${isInitialized}`);
        if (isInitialized) {
          reconnectFn();
        } else {
          log.warn(
            "Background service not initialized; forcing TrackPlayer service re-registration instead of reconnect"
          );
          TrackPlayer.registerPlaybackService(() => require("../PlayerBackgroundService"));
        }
      } else {
        // Function doesn't exist (old version or incompatible module)
        log.warn("reconnectBackgroundService function not found - forcing full re-registration");

        // Shutdown if the function exists
        if (typeof PlayerBackgroundServiceModule.shutdownBackgroundService === "function") {
          PlayerBackgroundServiceModule.shutdownBackgroundService();
        }

        // Force re-registration
        TrackPlayer.registerPlaybackService(() => require("../PlayerBackgroundService"));
      }

      await configureTrackPlayer();

      log.info("Background service reconnection complete");
    } catch (error) {
      log.error("Error reconnecting background service", error as Error);
    }
  }

  /**
   * Refresh file paths after iOS container path changes.
   * Refreshes cover URI and now playing metadata. Call when app comes to foreground.
   */
  async refreshFilePathsAfterContainerChange(): Promise<void> {
    log.info("[PlayerService] Refreshing file paths after potential container change...");

    try {
      const store = useAppStore.getState();
      const currentTrack = store.player.currentTrack;

      if (!currentTrack) {
        log.debug("No current track, skipping path refresh");
        return;
      }

      // The cover URI may contain an old absolute path
      // getCoverUri() will resolve it to the current container path
      const refreshedCoverUri = getCoverUri(currentTrack.libraryItemId);

      // Check if the cover URI actually changed
      if (refreshedCoverUri !== currentTrack.coverUri) {
        log.info(
          `[PlayerService] Cover URI changed for ${currentTrack.libraryItemId}, updating track metadata`
        );
        log.debug(`  Old: ${currentTrack.coverUri}`);
        log.debug(`  New: ${refreshedCoverUri}`);

        // Update the track in the store
        const updatedTrack: PlayerTrack = {
          ...currentTrack,
          coverUri: refreshedCoverUri,
        };

        store._setCurrentTrack(updatedTrack);

        // Update TrackPlayer's now playing metadata with the new cover URI so
        // the lock screen and notification show the correct cover.
        const position = useAppStore.getState().player.position;
        await updateNowPlayingMetadata(updatedTrack, position);

        log.info("[PlayerService] Track metadata refreshed with new cover URI");
      } else {
        log.debug("Cover URI unchanged, no refresh needed");
      }
    } catch (error) {
      log.error("Failed to refresh file paths after container change", error as Error);
      // Don't throw - this is a best-effort operation
    }
  }
}
