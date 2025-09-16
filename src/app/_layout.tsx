import { DbProvider } from "@/providers/DbProvider";
import { LibraryProvider } from "@/providers/LibraryProvider";
import { Stack } from "expo-router";
import { useThemedStyles } from "../lib/theme";
import { AuthProvider } from "../providers/AuthProvider";

export default function RootLayout() {
  const { isDark, colors } = useThemedStyles();
  return (
    <DbProvider>
      <AuthProvider>
        <LibraryProvider>
          <Stack>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ presentation: "formSheet", headerTitle: "Sign in" }} />
          </Stack>
        </LibraryProvider>
      </AuthProvider>
    </DbProvider>
  );
}
