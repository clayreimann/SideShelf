/**
 * Deep link handler for sideshelf:// URLs.
 *
 * Extracted from _layout.tsx to be a standalone testable function.
 * Called by _layout.tsx via Linking.addEventListener and Linking.getInitialURL().
 *
 * Auth and player state are read from the Zustand store at call time.
 */

import { router } from "expo-router";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import { useAppStore } from "@/stores/appStore";
import { logger } from "@/lib/logger";

const log = logger.forTag("deepLinkHandler");

/**
 * Handle a sideshelf:// deep link URL.
 *
 * Reads isAuthenticated and player state from the Zustand store at call time.
 * Non-sideshelf:// URLs are silently ignored (handled by other branches in _layout.tsx).
 */
export async function handleDeepLinkUrl(url: string): Promise<void> {
  try {
    const urlObj = new URL(url);
    const scheme = urlObj.protocol.replace(":", "");

    if (scheme !== "sideshelf") {
      // Not our scheme — ignore silently
      return;
    }

    const store = useAppStore.getState();
    const isAuthenticated = store.auth?.isAuthenticated ?? false;

    if (!isAuthenticated) {
      log.info("[handleDeepLinkUrl] Not authenticated — redirecting to login");
      router.push("/login");
      return;
    }

    const host = urlObj.hostname;

    switch (host) {
      case "":
      case "home":
        router.navigate("/(tabs)");
        break;

      case "library":
        router.navigate("/(tabs)/library");
        break;

      case "series":
        router.navigate("/(tabs)/series");
        break;

      case "authors":
        router.navigate("/(tabs)/authors");
        break;

      case "more":
        router.navigate("/(tabs)/more");
        break;

      case "item": {
        // Path: /item/[ID] → hostname is "item", pathname is "/[ID]"
        // URL: sideshelf://item/ABC123 → host="item", pathname="/ABC123"
        const itemId = urlObj.pathname.slice(1); // strip leading "/"
        router.push(`/(tabs)/library/item/${itemId}`);
        break;
      }

      case "resume": {
        const currentTrack = store.player?.currentTrack ?? null;
        if (currentTrack) {
          dispatchPlayerEvent({ type: "PLAY" });
        } else {
          log.warn("[handleDeepLinkUrl] sideshelf://resume — no track loaded, no-op");
        }
        break;
      }

      case "play-pause": {
        const isPlaying = store.player?.isPlaying ?? false;
        if (isPlaying) {
          dispatchPlayerEvent({ type: "PAUSE" });
        } else {
          dispatchPlayerEvent({ type: "PLAY" });
        }
        break;
      }

      default:
        log.warn(`[handleDeepLinkUrl] Unknown deep link host: ${host}`);
        break;
    }
  } catch (error) {
    log.error("Failed to process sideshelf:// deep link", error as Error);
  }
}
