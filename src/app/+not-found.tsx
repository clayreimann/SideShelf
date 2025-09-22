import { useThemedStyles } from '@/lib/theme';
import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

export default function NotFoundScreen() {
  const { styles, colors, header } = useThemedStyles();

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Oops! Not Found',
          headerStyle: { backgroundColor: header.backgroundColor },
          headerTintColor: header.tintColor,
          headerTitleStyle: { color: header.titleColor },
        }}
      />
      <View style={styles.container}>
        <Link href="/(tabs)/home" style={[styles.link, { fontSize: 20 }]}>
          Go back to Home screen!
        </Link>
      </View>
    </>
  );
}
