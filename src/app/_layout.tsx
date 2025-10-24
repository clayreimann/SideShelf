import { initializeApp } from "@/index";
import { useThemedStyles } from "@/lib/theme";
import { AuthProvider } from "@/providers/AuthProvider";
import { DbProvider } from "@/providers/DbProvider";
import { StoreProvider } from "@/providers/StoreProvider";
import { playerService } from "@/services/PlayerService";
import { unifiedProgressService } from "@/services/ProgressService";
import {
    FontAwesome6,
    MaterialCommunityIcons,
    Octicons,
} from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus, View } from "react-native";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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
        console.log("[RootLayout] App initialization completed successfully");
      } catch (error) {
        console.error("[RootLayout] Failed to initialize app:", error);
      }
    };

    initialize();
  }, []);

  // Handle app state changes for refetching progress and reconnection
  useEffect(() => {
    const lastBackgroundTime = useRef<number>(0);
    const playerInitTimestamp = useRef<number>(0);

    // Store the player init timestamp on mount
    playerInitTimestamp.current = playerService.getInitializationTimestamp();

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "background") {
        lastBackgroundTime.current = Date.now();
      } else if (nextAppState === "active") {
        const timeInBackground = Date.now() - lastBackgroundTime.current;
        const wasLongBackground = timeInBackground > 30000; // 30 seconds

        // Check if JS context was recreated (player service re-initialized)
        const currentPlayerInitTimestamp = playerService.getInitializationTimestamp();
        const contextRecreated = currentPlayerInitTimestamp !== playerInitTimestamp.current;

        if (contextRecreated) {
          console.log(
            "[RootLayout] JS context was recreated, player init timestamp changed"
          );
          playerInitTimestamp.current = currentPlayerInitTimestamp;
        }

        if (wasLongBackground || contextRecreated) {
          console.log(
            `[RootLayout] App resumed after ${Math.round(timeInBackground / 1000)}s or context recreated, verifying player connection`
          );

          // Verify connection between TrackPlayer and store
          const isConnected = await playerService.verifyConnection();

          if (!isConnected || contextRecreated) {
            console.log(
              "[RootLayout] Connection mismatch or context recreated, reconnecting background service"
            );
            await playerService.reconnectBackgroundService();
          }
        }

        console.log(
          "[RootLayout] App became active, triggering progress refetch"
        );
        // Fetch latest progress from server when app becomes active
        unifiedProgressService.fetchServerProgress().catch((error) => {
          console.error(
            "[RootLayout] Failed to fetch server progress on app foreground:",
            error
          );
        });
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription?.remove();
    };
  }, []);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
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
    </View>
  );
}
