import { Stack } from "expo-router";
import { AuthProvider } from "../providers/AuthProvider";

export default function RootLayout() {
  return <AuthProvider>
    <Stack>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ presentation: "formSheet", headerTitle: "Sign in" }} />
    </Stack>
  </AuthProvider>;
}
