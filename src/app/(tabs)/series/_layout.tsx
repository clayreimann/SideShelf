import { useThemedStyles } from '@/lib/theme';
import { Stack } from 'expo-router';

export default function SeriesLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Series' }} />
      <Stack.Screen name="[seriesId]" options={{ title: 'Series' }} />
      <Stack.Screen name="[seriesId]/item/[itemId]" options={{ headerTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
    </Stack>
  );
}
