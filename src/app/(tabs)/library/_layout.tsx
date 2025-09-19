import { useThemedStyles } from "@/lib/theme";
import { Stack } from "expo-router";

export default function LibraryLayout() {
    const { isDark, colors } = useThemedStyles();
    return (
        <Stack screenOptions={{ headerShown: true }}>
            <Stack.Screen name="index" options={{ title: 'Library' }} />
        </Stack>
    );
}
