import { Text, View } from 'react-native';
import { useThemedStyles } from '../../lib/theme';

export default function AboutScreen() {
  const { styles } = useThemedStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Collections screen</Text>
    </View>
  );
}
