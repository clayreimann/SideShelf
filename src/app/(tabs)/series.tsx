import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { useThemedStyles } from '../../lib/theme';

export default function SeriesScreen() {
  const { styles } = useThemedStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Series screen</Text>
      <Stack.Screen options={{ title: 'Series', headerTitle: 'Series' }} />
    </View>
  );
}
