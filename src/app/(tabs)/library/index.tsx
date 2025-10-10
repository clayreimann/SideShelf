import { LibraryItemList, LibraryPicker } from '@/components/library';
import { HeaderControls, SortMenu } from '@/components/ui';
import { useThemedStyles } from '@/lib/theme';
import { SortField, useLibrary } from '@/stores';
import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Button, Text, View } from 'react-native';

export default function LibraryScreen() {
  const { styles, isDark } = useThemedStyles();
  const { libraries, items, selectLibrary, selectedLibrary, isLoadingItems, refresh, sortConfig, setSortConfig } = useLibrary();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const toggleViewMode = useCallback(() => setViewMode(viewMode === 'grid' ? 'list' : 'grid'), [viewMode]);

  const controls = useCallback(() => (
    <HeaderControls
      isDark={isDark}
      viewMode={viewMode}
      onToggleViewMode={toggleViewMode}
      onSort={() => setShowSortMenu(true)}
    />
  ), [isDark, viewMode, toggleViewMode]);

  // ApiLibrary sort options
  const librarySortOptions = [
    { field: 'title' as SortField, label: 'Title' },
    { field: 'author' as SortField, label: 'Author' },
    { field: 'publishedYear' as SortField, label: 'Published Year' },
    { field: 'addedAt' as SortField, label: 'Date Added' },
  ];

  if (!libraries.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No libraries found.</Text>
        <Button title='Refresh' onPress={onRefresh} />
      </View>
    );
  }

  const title = selectedLibrary?.name || 'Library';

  return (
    <>
      <View style={styles.container} needsOffscreenAlphaCompositing={true}>
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
          sortOptions={librarySortOptions}
          isDark={isDark}
        />
        <Stack.Screen options={{ title, headerTitle: title, headerRight: controls }} />
      </View>
    </>
  );
}
