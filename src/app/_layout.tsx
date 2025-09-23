import { useThemedStyles } from "@/lib/theme";
import { AuthProvider } from "@/providers/AuthProvider";
import { DbProvider } from "@/providers/DbProvider";
import { StoreProvider } from "@/providers/StoreProvider";
import { Stack } from "expo-router";

export default function RootLayout() {
  const { colors, header } = useThemedStyles();

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
          </Stack>
        </StoreProvider>
      </AuthProvider>
    </DbProvider>
  );
}
