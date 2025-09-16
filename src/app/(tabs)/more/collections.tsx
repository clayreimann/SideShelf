import { useThemedStyles } from '@/lib/theme';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function AboutScreen() {
  const { styles } = useThemedStyles();
  return (
    <>
      <View style={styles.container}>
        <Text style={styles.text}>Collections screen</Text>
      </View>
      <Stack.Screen options={{ title: 'Collections' }} />
    </>
  );
}
