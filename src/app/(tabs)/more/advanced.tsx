import { useThemedStyles } from '@/lib/theme';
import { useLibrary } from '@/providers/LibraryProvider';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

type ActionItem = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function AdvancedScreen() {
  const { styles, isDark } = useThemedStyles();
  const { refetchItems, selectedLibrary, refetchLibraries, libraries } = useLibrary();
  const data = useMemo(() => {
    return [
      {
        label: `Libraries found: ${libraries.length}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: `Selected library: ${selectedLibrary?.name}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: 'Refetch library list',
        onPress: refetchLibraries,
        disabled: false,
      },
      {
      label: 'Refetch library items',
      onPress: refetchItems,
      disabled: !selectedLibrary,
    }];
  }, [selectedLibrary, libraries]);

  return (
    <>
      <FlatList
        data={data}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Pressable onPress={item.onPress} disabled={item.disabled}>
              <Text style={styles.text}>{item.label}</Text>
            </Pressable>
          </View>
        )}
        contentContainerStyle={styles.flatListContainer}
        indicatorStyle={isDark ? 'white' : 'black'}
      />
      <Stack.Screen options={{ title: 'Advanced' }} />
    </>
  );
}
