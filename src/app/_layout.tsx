import { initializeApp } from "@/index";
import { formatTimeRemaining } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { AuthProvider } from "@/providers/AuthProvider";
import { DbProvider } from "@/providers/DbProvider";
import { StoreProvider } from "@/providers/StoreProvider";
import { playerService } from "@/services/PlayerService";
import { progressService } from "@/services/ProgressService";
import { useAppStore } from "@/stores/appStore";
import { ErrorBoundary } from "@/components/errors";
import { FontAwesome6, MaterialCommunityIcons, Octicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus, Linking, View } from "react-native";
import TrackPlayer, { State } from "react-native-track-player";

// Create cached sublogger for this component
const log = logger.forTag("RootLayout");
const diagLog = logger.forDiagnostics("RootLayout");

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  // Diagnostic: log mount/unmount and AppState transitions
  useEffect(() => {
    diagLog.info("RootLayout mounted");
    return () => {
      diagLog.info("RootLayout unmounted");
    };
  }, []);
  const { colors, header } = useThemedStyles();

  // Load custom fonts
  FontAwesome6.font;
  const [fontsLoaded, fontsError] = useFonts({
    FontAwesome6: FontAwesome6.font,
    MaterialCommunityIcons: MaterialCommunityIcons.font,
    Octicons: Octicons.font,
  });

  // Wait for fonts to load before rendering the app
  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontsError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontsError]);

  // Initialize all app services on startup
  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeApp();
        log.info("App initialization completed successfully");
      } catch (error) {
        log.error("Failed to initialize app", error as Error);
      }
    };

    initialize();
  }, []);

  // Handle app state changes for refetching progress and reconnection
  const lastBackgroundTime = useRef<number>(0);
  const playerInitTimestamp = useRef<number>(0);
  useEffect(() => {
    // Store the player init timestamp on mount
    playerInitTimestamp.current = playerService.getInitializationTimestamp();

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      diagLog.info(`AppState changed: ${nextAppState}`);

      if (nextAppState === "background") {
        lastBackgroundTime.current = Date.now();
        log.info("App moved to background");
        // Trigger log purge when app goes to background
        logger.manualTrim();
      } else if (nextAppState === "active") {
        const timeInBackground = Date.now() - lastBackgroundTime.current;
        const wasLongBackground = timeInBackground > 30000; // 30 seconds

        log.info(
          `App moved to foreground (was backgrounded for ${(timeInBackground / 1000).toFixed(2)}s)`
        );

        // Check TrackPlayer directly to see if it's currently playing
        let trackPlayerIsPlaying = false;
        try {
          const tpState = await TrackPlayer.getPlaybackState();
          trackPlayerIsPlaying = tpState.state === State.Playing;
        } catch (error) {
          log.warn(`Failed to check TrackPlayer state, assuming not playing ${error}`);
        }

        if (trackPlayerIsPlaying) {
          log.info(
            "TrackPlayer is currently playing, syncing state FROM TrackPlayer and skipping restoration"
          );

          // Sync state FROM TrackPlayer to store (don't update TrackPlayer)
          try {
            await playerService.syncStoreWithTrackPlayer();
            log.info("State synced from TrackPlayer successfully");
          } catch (error) {
            log.error("Failed to sync state from TrackPlayer", error as Error);
          }

          // Still update player init timestamp if context was recreated
          const currentPlayerInitTimestamp = playerService.getInitializationTimestamp();
          if (currentPlayerInitTimestamp !== playerInitTimestamp.current) {
            log.warn("JS context was recreated - player init timestamp changed");
            playerInitTimestamp.current = currentPlayerInitTimestamp;
          }

          // Still fetch progress from server and sync position
          log.info("Triggering progress refetch on app foreground");
          progressService
            .fetchServerProgress()
            .then(async () => {
              // Sync position from database after fetching server progress
              await playerService.syncPositionFromDatabase().catch((error) => {
                log.error("Failed to sync position from database", error as Error);
              });
            })
            .catch((error) => {
              log.error("Failed to fetch server progress on app foreground", error as Error);
            });

          return; // Skip all restoration operations that would update TrackPlayer
        }

        // Check if JS context was recreated (player service re-initialized)
        const currentPlayerInitTimestamp = playerService.getInitializationTimestamp();
        const contextRecreated = currentPlayerInitTimestamp !== playerInitTimestamp.current;

        if (contextRecreated) {
          log.warn("JS context was recreated - player init timestamp changed");
          playerInitTimestamp.current = currentPlayerInitTimestamp;
        }

        if (wasLongBackground || contextRecreated) {
          log.info(
            `App resumed after long background (${formatTimeRemaining(Math.round(timeInBackground / 1000))}s) or context recreated, verifying player connection`
          );

          // Verify connection between TrackPlayer and store
          // Restore current track from AsyncStore if missing
          await useAppStore.getState().restorePersistedState();
          const isConsistent = await playerService.verifyTrackPlayerConsistency();
          log.info(`Player service isConsistent=${isConsistent}`);

          // Reconcile TrackPlayer state to ensure sync
          await playerService.reconcileTrackPlayerState();

          // if (!isConnected || contextRecreated) {
          //   log.warn("Connection mismatch or context recreated, reconnecting background service");
          //   await playerService.reconnectBackgroundService();
          // }
        }

        log.info("Triggering progress refetch on app foreground");
        // Fetch latest progress from server when app becomes active
        progressService
          .fetchServerProgress()
          .then(async () => {
            // Sync position from database after fetching server progress
            await playerService.syncPositionFromDatabase().catch((error) => {
              log.error("Failed to sync position from database", error as Error);
            });
          })
          .catch((error) => {
            log.error("Failed to fetch server progress on app foreground", error as Error);
          });
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, []);

  // Handle deep links for logger configuration
  useEffect(() => {
    /**
     * Parse logger configuration from URL query parameters
     * Format: side-shelf://logger?level[TAG_NAME]=warn&level[TAG_NAME_3]=debug&enabled[TAG_NAME_2]=false
     */
    const handleDeepLink = async (url: string) => {
      try {
        // Check if this is a logger configuration URL
        if (!url.includes("://logger")) {
          return;
        }

        log.info(`Processing logger deep link: ${url}`);
        const urlObj = new URL(url);

        // Parse query parameters with bracket notation
        const tagLevels: Record<string, string> = {};
        const tagEnabled: Record<string, string> = {};

        urlObj.searchParams.forEach((value, key) => {
          // Parse level[TAG_NAME]=warn format
          const levelMatch = key.match(/^level\[(.+)\]$/);
          if (levelMatch) {
            const tagName = decodeURIComponent(levelMatch[1]);
            tagLevels[tagName] = value;
          }

          // Parse enabled[TAG_NAME]=false format
          const enabledMatch = key.match(/^enabled\[(.+)\]$/);
          if (enabledMatch) {
            const tagName = decodeURIComponent(enabledMatch[1]);
            tagEnabled[tagName] = value;
          }
        });

        // Apply logger configurations
        let configApplied = false;

        // Set log levels
        for (const [tag, level] of Object.entries(tagLevels)) {
          const logLevel = level.toLowerCase() as "debug" | "info" | "warn" | "error";
          if (["debug", "info", "warn", "error"].includes(logLevel)) {
            await logger.setTagLevel(tag, logLevel);
            log.info(`Set log level for tag "${tag}" to ${logLevel}`);
            configApplied = true;
          }
        }

        // Set enabled/disabled state
        for (const [tag, enabledValue] of Object.entries(tagEnabled)) {
          const isEnabled = enabledValue.toLowerCase() !== "false";
          if (isEnabled) {
            logger.enableTag(tag);
            log.info(`Enabled tag "${tag}"`);
          } else {
            logger.disableTag(tag);
            log.info(`Disabled tag "${tag}"`);
          }
          configApplied = true;
        }

        if (configApplied) {
          // Navigate to logger settings screen
          router.push("/more/logger-settings");
          log.info("Logger configuration applied, navigating to logger settings");
        } else {
          log.warn("No valid logger configuration found in deep link");
        }
      } catch (error) {
        log.error("Failed to process logger deep link", error as Error);
      }
    };

    // Handle initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ErrorBoundary boundaryName="AppRoot">
        <DbProvider>
          <AuthProvider>
            <StoreProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                  headerStyle: { backgroundColor: header.backgroundColor },
                  headerTintColor: header.tintColor,
                  headerTitleStyle: { color: header.titleColor },
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="login"
                  options={{
                    presentation: "formSheet",
                    headerTitle: "Sign in",
                    headerShown: true,
                    headerStyle: { backgroundColor: header.backgroundColor },
                    headerTintColor: header.tintColor,
                    headerTitleStyle: { color: header.titleColor },
                  }}
                />
                <Stack.Screen
                  name="FullScreenPlayer"
                  options={{
                    presentation: "containedModal",
                    headerShown: false,
                  }}
                />
              </Stack>
            </StoreProvider>
          </AuthProvider>
        </DbProvider>
      </ErrorBoundary>
    </View>
  );
}
