import { initializeApp } from "@/index";
import { useThemedStyles } from "@/lib/theme";
import { AuthProvider } from "@/providers/AuthProvider";
import { DbProvider } from "@/providers/DbProvider";
import { StoreProvider } from "@/providers/StoreProvider";
import { unifiedProgressService } from "@/services/UnifiedProgressService";
import {
  FontAwesome6,
  MaterialCommunityIcons,
  Octicons,
} from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect } from "react";
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

  // Handle app state changes for refetching progress
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
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
