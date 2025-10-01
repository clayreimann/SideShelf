import { initializeApp } from "@/index";
import { useThemedStyles } from "@/lib/theme";
import { AuthProvider } from "@/providers/AuthProvider";
import { DbProvider } from "@/providers/DbProvider";
import { StoreProvider } from "@/providers/StoreProvider";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";

export default function RootLayout() {
  const { colors, header } = useThemedStyles();

  // Initialize all app services on startup
  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeApp();
        console.log('[RootLayout] App initialization completed successfully');
      } catch (error) {
        console.error('[RootLayout] Failed to initialize app:', error);
      }
    };

    initialize();
  }, []);

  // Handle app state changes for refetching progress
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[RootLayout] App became active, triggering progress refetch');
        // Dispatch a custom event that can be listened to by components that need to refetch progress
        // We use a custom event rather than directly calling APIs here to avoid coupling
        const event = new CustomEvent('appBecameActive');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(event);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, []);

  return (
    <DbProvider>
      <AuthProvider>
        <StoreProvider>
          <Stack screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            headerStyle: { backgroundColor: header.backgroundColor },
            headerTintColor: header.tintColor,
            headerTitleStyle: { color: header.titleColor },
          }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{
              presentation: "formSheet",
              headerTitle: "Sign in",
              headerShown: true,
              headerStyle: { backgroundColor: header.backgroundColor },
              headerTintColor: header.tintColor,
              headerTitleStyle: { color: header.titleColor },
            }} />
            <Stack.Screen name="FullScreenPlayer" options={{
              presentation: 'containedModal',
              headerShown: false,
            }} />
          </Stack>
        </StoreProvider>
      </AuthProvider>
    </DbProvider>
  );
}
