import { translate } from '@/i18n';
import { useThemedStyles } from '@/lib/theme';
import { Stack } from 'expo-router';

export default function MoreLayout() {
  const { colors, header } = useThemedStyles();
  return (
    <Stack screenOptions={{
      headerShown: true,
      contentStyle: { backgroundColor: colors.background },
      headerStyle: { backgroundColor: header.backgroundColor },
      headerTintColor: header.tintColor,
      headerTitleStyle: { color: header.titleColor },
      headerShadowVisible: false,
    }}>
      <Stack.Screen name="index" options={{ title: translate('tabs.more') }} />
    </Stack>
  );
}
