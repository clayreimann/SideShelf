import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function AboutMeScreen() {
  const { styles } = useThemedStyles();
  const { username, serverUrl } = useAuth();
  return (
    <>
      <View style={styles.container}>
        <Text style={styles.text}>User: {username}</Text>
        <Text style={styles.text}>Audiobookshelf: {serverUrl}</Text>
      </View>
      <Stack.Screen options={{ title: 'About Me' }} />
    </>
  );
}
