import { useThemedStyles } from '@/lib/theme';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
// import { LibraryItemList, LibraryItemDetail } from '@/components/library';

export default function SeriesScreen() {
  const { styles } = useThemedStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Series screen</Text>
      <Text style={[styles.text, { fontSize: 12, marginTop: 8, opacity: 0.7 }]}>
        This screen can now use the reusable LibraryItemList and LibraryItemDetail components to display series
      </Text>
      <Stack.Screen options={{ title: 'Series', headerTitle: 'Series' }} />
    </View>
  );
}
