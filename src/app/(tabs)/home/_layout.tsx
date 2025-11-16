import { translate } from '@/i18n';
import { useThemedStyles } from '@/lib/theme';
import { Stack } from 'expo-router';
import { TabErrorBoundary } from '@/components/errors';

export default function HomeLayout() {
  const { colors, header } = useThemedStyles();
  return (
    <TabErrorBoundary tabName="Home">
      <Stack screenOptions={{
        headerShown: true,
        contentStyle: { backgroundColor: colors.background },
        headerStyle: { backgroundColor: header.backgroundColor },
        headerTintColor: header.tintColor,
        headerTitleStyle: { color: header.titleColor },
        headerShadowVisible: false,
      }}>
        <Stack.Screen name="index" options={{ title: translate('tabs.home') }} />
        <Stack.Screen name="item/[itemId]" options={{ headerTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      </Stack>
    </TabErrorBoundary>
  );
}
