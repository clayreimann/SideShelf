import { useThemedStyles } from '@/lib/theme';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function AboutScreen() {
  const { styles } = useThemedStyles();
  const { id } = useLocalSearchParams();
  return (
    <>
      <View style={styles.container}>
        <Text style={styles.text}>Library item: {id}</Text>
        <Stack.Screen options={{ headerTitle: 'Library item' }} />
      </View>
    </>
  );
}
