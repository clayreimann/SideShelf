import { useThemedStyles } from '@/lib/theme';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
// import { LibraryItemList } from '@/components/library';

export default function AuthorsScreen() {
  const { styles } = useThemedStyles();
  return (
    <>
      <View style={styles.container}>
        <Text style={styles.text}>Authors screen</Text>
        <Text style={[styles.text, { fontSize: 12, marginTop: 8, opacity: 0.7 }]}>
          This screen can now use the reusable LibraryItemList component to display authors
        </Text>
        <Stack.Screen options={{ headerTitle: 'Authors' }} />
      </View>
    </>
  );
}
