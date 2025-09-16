import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles } from '../../lib/theme';
import { useLibrary } from '../../providers/LibraryProvider';

export default function LibraryScreen() {
  const { styles, isDark } = useThemedStyles();
  const { selectedLibrary, items, isLoadingItems, refetchItems, libraries, selectLibrary } = useLibrary();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const headerTitle = selectedLibrary?.name || 'Library';

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetchItems();
    setIsRefreshing(false);
  }, [refetchItems]);

  // Update header title
  useEffect(() => {
    // no-op; title set via Stack.Screen options below
  }, [headerTitle]);

  const data = useMemo(() => items, [items]);

  const showEmpty = !libraries?.length;

  const LibraryPicker = useMemo(() => {
    const options = libraries || [];
    if (!options.length) return null;
    return (
      <View style={{ paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((lib) => (
          <TouchableOpacity key={lib.id} onPress={() => selectLibrary(lib.id)}>
            <Text style={{ color: selectedLibrary?.id === lib.id ? (isDark ? '#fff' : '#000') : '#888' }}>{lib.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [libraries, selectLibrary, selectedLibrary, isDark]);

  return (
    <>
      {LibraryPicker}
      {showEmpty ? (
        <View style={styles.container}>
          <Text style={styles.text}>No libraries available. Try signing in or refreshing.</Text>
        </View>
      ) : (
      <FlatList
        data={data}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Text style={styles.text}>{item.title || 'Untitled'}</Text>
          </View>
        )}
        contentContainerStyle={styles.flatListContainer}
        indicatorStyle={isDark ? 'white' : 'black'}
        refreshControl={<RefreshControl refreshing={isRefreshing || isLoadingItems} onRefresh={onRefresh} tintColor={isDark ? '#fff' : '#000'} />}
      />
      )}
      <Stack.Screen options={{ title: headerTitle }} />
    </>
  );
}
