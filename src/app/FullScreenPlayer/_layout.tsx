import { useThemedStyles } from "@/lib/theme";
import { Stack } from "expo-router";

export default function FullScreenPlayerLayout() {
  const { colors } = useThemedStyles();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
