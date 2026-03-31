/**
 * Deep link handler for sideshelf:// URLs.
 *
 * Extracted from _layout.tsx to be a standalone testable function.
 * Called by _layout.tsx via Linking.addEventListener and Linking.getInitialURL().
 *
 * Auth is checked via apiClientService (synchronous token check).
 * Tab visibility is read from the Zustand store so hidden tabs are routed
 * through the More stack instead of their own tab stacks.
 * Player state is read from the Zustand store at call time.
 */

import { router } from "expo-router";
import { apiClientService } from "@/services/ApiClientService";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import { useAppStore } from "@/stores/appStore";
import { logger } from "@/lib/logger";

const log = logger.forTag("deepLinkHandler");

/**
 * Return the navigation path for a tab, routing through More if the tab is hidden.
 *
 * Tabs that the user has hidden from the tab bar are still accessible via the
 * More tab (e.g. /(tabs)/more/series). This ensures deep links always open the
 * correct screen regardless of the user's tab visibility settings.
 */
function resolveTabPath(
  tabName: "series" | "authors",
  hiddenTabs: string[],
  ownPath: string,
  morePath: string
): string {
  const isHidden = hiddenTabs.includes(tabName);
  const resolved = isHidden ? morePath : ownPath;
  log.info(`[resolveTabPath] tab="${tabName}" hidden=${String(isHidden)} → "${resolved}"`);
  return resolved;
}

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

    const store = useAppStore.getState();
    const hiddenTabs: string[] = store.settings?.hiddenTabs ?? [];
    const host = urlObj.hostname;
    log.info(`[handleDeepLinkUrl] routing host="${host}" hiddenTabs=${JSON.stringify(hiddenTabs)}`);

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

      case "series": {
        const path = resolveTabPath("series", hiddenTabs, "/(tabs)/series", "/(tabs)/more/series");
        router.navigate(path);
        break;
      }

      case "authors": {
        const path = resolveTabPath(
          "authors",
          hiddenTabs,
          "/(tabs)/authors",
          "/(tabs)/more/authors"
        );
        router.navigate(path);
        break;
      }

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
        const currentTrack = store.player?.currentTrack ?? null;
        if (currentTrack) {
          log.info("[handleDeepLinkUrl] dispatching PLAY for resume");
          dispatchPlayerEvent({ type: "PLAY" }, { source: "ui" });
        } else {
          log.warn("[handleDeepLinkUrl] sideshelf://resume — no track loaded, no-op");
        }
        // Pop the 404 Expo Router pushed for sideshelf://resume; fall back to home if nothing to go back to
        if (router.canGoBack()) {
          router.back();
        } else {
          router.navigate("/(tabs)/home");
        }
        break;
      }

      case "play-pause": {
        const isPlaying = store.player?.isPlaying ?? false;
        log.info(`[handleDeepLinkUrl] play-pause isPlaying=${String(isPlaying)}`);
        if (isPlaying) {
          dispatchPlayerEvent({ type: "PAUSE" }, { source: "ui" });
        } else {
          dispatchPlayerEvent({ type: "PLAY" }, { source: "ui" });
        }
        // Pop the 404 Expo Router pushed for sideshelf://play-pause; fall back to home if nothing to go back to
        if (router.canGoBack()) {
          router.back();
        } else {
          router.navigate("/(tabs)/home");
        }
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
