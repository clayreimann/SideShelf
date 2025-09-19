import { useThemedStyles } from "@/lib/theme";
import { AuthProvider } from "@/providers/AuthProvider";
import { DbProvider } from "@/providers/DbProvider";
import { LibraryProvider } from "@/providers/LibraryProvider";
import { Stack } from "expo-router";

export default function RootLayout() {
  const { isDark, colors } = useThemedStyles();
  return (
    <DbProvider>
      <AuthProvider>
        <LibraryProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ presentation: "formSheet", headerTitle: "Sign in" }} />
          </Stack>
        </LibraryProvider>
      </AuthProvider>
    </DbProvider>
  );
}
