import { LibraryItemList, LibraryPicker } from '@/components/library';
import { HeaderControls, SortMenu } from '@/components/ui';
import { useThemedStyles } from '@/lib/theme';
import { SortField, useLibrary } from '@/stores';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

export default function AboutScreen() {
  const { styles, isDark } = useThemedStyles();
  const { libraries, items, selectLibrary, selectedLibrary, isLoadingItems, refetchItems, refetchLibraries, sortConfig, setSortConfig } = useLibrary();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const onRefresh = useCallback(async () => {
    await refetchItems();
  }, [refetchItems]);

  const toggleViewMode = useCallback(() => setViewMode(viewMode === 'grid' ? 'list' : 'grid'), [viewMode]);

  useFocusEffect(
    useCallback(() => {
      refetchLibraries();
    }, [refetchLibraries])
  );


  const controls = useCallback(() => (
    <HeaderControls
      isDark={isDark}
      viewMode={viewMode}
      onToggleViewMode={toggleViewMode}
      onSort={() => setShowSortMenu(true)}
    />
  ), [isDark, viewMode, toggleViewMode]);

  // Library sort options
  const librarySortOptions = [
    { field: 'title' as SortField, label: 'Title' },
    { field: 'author' as SortField, label: 'Author' },
    { field: 'publishedYear' as SortField, label: 'Published Year' },
    { field: 'addedAt' as SortField, label: 'Date Added' },
  ];

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
          sortOptions={librarySortOptions}
          isDark={isDark}
        />
        <Stack.Screen options={{ title, headerTitle: title, headerRight: controls }} />
      </View>
    </>
  );
}
