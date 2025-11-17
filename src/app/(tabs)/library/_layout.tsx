import { useThemedStyles } from "@/lib/theme";
import { Stack } from "expo-router";
import { TabErrorBoundary } from '@/components/errors';

export default function LibraryLayout() {
    const { colors, header } = useThemedStyles();
    return (
        <TabErrorBoundary tabName="Library">
            <Stack screenOptions={{
                headerShown: true,
                contentStyle: { backgroundColor: colors.background },
                headerStyle: { backgroundColor: header.backgroundColor },
                headerTintColor: header.tintColor,
                headerTitleStyle: { color: header.titleColor },
                headerShadowVisible: false,
            }}/>
        </TabErrorBoundary>
    );
}
