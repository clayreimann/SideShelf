/**
 * Deep link handler for sideshelf:// URLs.
 *
 * Extracted from _layout.tsx to be a standalone testable function.
 * Called by _layout.tsx via Linking.addEventListener and Linking.getInitialURL().
 *
 * Auth is checked via apiClientService (synchronous token check).
 * Player state is read from the Zustand store at call time.
 */

import { router } from "expo-router";
import { apiClientService } from "@/services/ApiClientService";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import { useAppStore } from "@/stores/appStore";
import { logger } from "@/lib/logger";

const log = logger.forTag("deepLinkHandler");

/**
 * Handle a sideshelf:// deep link URL.
 *
 * Auth is checked via apiClientService.isAuthenticated() — the same source
 * AuthProvider uses. Non-sideshelf:// URLs are silently ignored.
 */
export async function handleDeepLinkUrl(url: string): Promise<void> {
  log.info(`[handleDeepLinkUrl] received url="${url}"`);
  try {
    const urlObj = new URL(url);
    const scheme = urlObj.protocol.replace(":", "");
    log.info(
      `[handleDeepLinkUrl] scheme="${scheme}" host="${urlObj.hostname}" pathname="${urlObj.pathname}"`
    );

    if (scheme !== "sideshelf") {
      log.info(`[handleDeepLinkUrl] ignoring non-sideshelf scheme: ${scheme}`);
      return;
    }

    const isAuthenticated = apiClientService.isAuthenticated();
    log.info(`[handleDeepLinkUrl] isAuthenticated=${String(isAuthenticated)}`);

    if (!isAuthenticated) {
      log.info("[handleDeepLinkUrl] Not authenticated — redirecting to login");
      router.push("/login");
      return;
    }

    const host = urlObj.hostname;
    log.info(`[handleDeepLinkUrl] routing host="${host}"`);

    switch (host) {
      case "":
      case "home":
        log.info("[handleDeepLinkUrl] navigating to /(tabs)/home");
        router.navigate("/(tabs)/home");
        break;

      case "library":
        log.info("[handleDeepLinkUrl] navigating to /(tabs)/library");
        router.navigate("/(tabs)/library");
        break;

      case "series":
        log.info("[handleDeepLinkUrl] navigating to /(tabs)/series");
        router.navigate("/(tabs)/series");
        break;

      case "authors":
        log.info("[handleDeepLinkUrl] navigating to /(tabs)/authors");
        router.navigate("/(tabs)/authors");
        break;

      case "more":
        log.info("[handleDeepLinkUrl] navigating to /(tabs)/more");
        router.navigate("/(tabs)/more");
        break;

      case "item": {
        const itemId = urlObj.pathname.slice(1); // strip leading "/"
        log.info(`[handleDeepLinkUrl] navigating to item itemId="${itemId}"`);
        // Route file is (tabs)/library/[item]/index.tsx — dynamic segment is the id directly
        router.navigate(`/(tabs)/library/${itemId}`);
        break;
      }

      case "resume": {
        const store = useAppStore.getState();
        const currentTrack = store.player?.currentTrack ?? null;
        if (currentTrack) {
          log.info("[handleDeepLinkUrl] dispatching PLAY for resume");
          dispatchPlayerEvent({ type: "PLAY" });
        } else {
          log.warn("[handleDeepLinkUrl] sideshelf://resume — no track loaded, no-op");
        }
        // Navigate to home: Expo Router would otherwise route sideshelf://resume as a path and show 404
        router.navigate("/(tabs)/home");
        break;
      }

      case "play-pause": {
        const store = useAppStore.getState();
        const isPlaying = store.player?.isPlaying ?? false;
        log.info(`[handleDeepLinkUrl] play-pause isPlaying=${String(isPlaying)}`);
        if (isPlaying) {
          dispatchPlayerEvent({ type: "PAUSE" });
        } else {
          dispatchPlayerEvent({ type: "PLAY" });
        }
        // Navigate to home: Expo Router would otherwise route sideshelf://play-pause as a path and show 404
        router.navigate("/(tabs)/home");
        break;
      }

      default:
        log.warn(`[handleDeepLinkUrl] Unknown deep link host: "${host}"`);
        break;
    }
  } catch (error) {
    log.error("Failed to process sideshelf:// deep link", error as Error);
  }
}
