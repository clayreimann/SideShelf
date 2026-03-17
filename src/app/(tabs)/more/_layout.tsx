import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { Stack } from "expo-router";
import { TabErrorBoundary } from "@/components/errors";

export default function MoreLayout() {
  const { colors, header } = useThemedStyles();
  return (
    <TabErrorBoundary tabName="More">
      <Stack
        screenOptions={{
          headerShown: true,
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: header.backgroundColor },
          headerTintColor: header.tintColor,
          headerTitleStyle: { color: header.titleColor },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: translate("tabs.more") }} />
        <Stack.Screen name="series" options={{ title: translate("tabs.series") }} />
        <Stack.Screen name="authors" options={{ title: translate("tabs.authors") }} />
        <Stack.Screen name="series/[seriesId]" options={{ title: translate("tabs.series") }} />
        <Stack.Screen name="authors/[authorId]" options={{ title: translate("tabs.authors") }} />
        <Stack.Screen name="trace-dumps" options={{ title: "Trace Dumps" }} />
        <Stack.Screen name="trace-dump-detail" options={{ title: "Trace Dump" }} />
      </Stack>
    </TabErrorBoundary>
  );
}
