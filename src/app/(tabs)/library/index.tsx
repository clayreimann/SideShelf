import { LibraryItemList, LibraryPicker } from '@/components/library';
import { SortMenu } from '@/components/ui';
import { useThemedStyles } from '@/lib/theme';
import { useLibrary } from '@/providers/LibraryProvider';
import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export default function AboutScreen() {
  const { styles, isDark } = useThemedStyles();
  const { libraries, items, selectLibrary, selectedLibrary, isLoadingItems, refetchItems, sortConfig, setSortConfig } = useLibrary();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const onRefresh = useCallback(async () => {
    await refetchItems();
  }, [refetchItems]);

  const toggleViewMode = useCallback(() => setViewMode(viewMode === 'grid' ? 'list' : 'grid'), [viewMode]);

  const controls = useCallback(() => (
    <View style={{ flexDirection: 'row', alignItems: 'center', }}>
      <TouchableOpacity
        onPress={toggleViewMode}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 6,
          backgroundColor: isDark ? '#333' : '#f0f0f0',
          marginRight: 8,
        }}
      >
        <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 14 }}>
          {viewMode === 'grid' ? 'List' : 'Grid'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setShowSortMenu(true)}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 6,
          backgroundColor: isDark ? '#333' : '#f0f0f0',
        }}
      >
        <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 14 }}>
          Sort
        </Text>
      </TouchableOpacity>
    </View>
  ), [isDark, viewMode, setShowSortMenu, toggleViewMode]);

  if (!libraries.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No libraries found, are you sure you are signed in?</Text>
      </View>
    );
  }

  const title = selectedLibrary?.name || 'Library';

  return (
    <>
      <View style={{ flex: 1 }}>
        <LibraryPicker
          libraries={libraries}
          selectLibrary={selectLibrary}
          selectedLibrary={selectedLibrary}
          isDark={isDark}
        />
        <LibraryItemList
          items={items}
          isLoading={isLoadingItems}
          onRefresh={onRefresh}
          viewMode={viewMode}
        />
        <SortMenu
          visible={showSortMenu}
          onClose={() => setShowSortMenu(false)}
          sortConfig={sortConfig}
          onSortChange={setSortConfig}
          isDark={isDark}
        />
        <Stack.Screen options={{ title, headerTitle: title, headerRight: controls }} />
      </View>
    </>
  );
}
