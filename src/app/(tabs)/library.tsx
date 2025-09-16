import { Stack } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { useThemedStyles } from '../../lib/theme';

export default function LibraryScreen() {
  const { styles, isDark } = useThemedStyles();
  let data = [];
  for (let i = 0; i < 100; i++) {
    data.push({ id: i, title: `Book ${i}` });
  }
  return (
    <>
      <FlatList
        data={data}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Text style={styles.text}>{item.title}</Text>
          </View>
        )}
        contentContainerStyle={styles.flatListContainer}
        indicatorStyle={isDark ? 'white' : 'black'}
      />
      <Stack.Screen options={{ title: "Library" }} />
    </>
  );
}
