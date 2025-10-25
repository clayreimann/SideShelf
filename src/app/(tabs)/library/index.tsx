import { LibraryItemList, LibraryPicker } from '@/components/library';
import { HeaderControls, SortMenu } from '@/components/ui';
import { translate } from '@/i18n';
import { useThemedStyles } from '@/lib/theme';
import { SortField, useLibrary } from '@/stores';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Text, View } from 'react-native';

export default function LibraryScreen() {
  const { styles, isDark } = useThemedStyles();
  const { libraries, items, selectLibrary, selectedLibrary, isLoadingItems, refresh, sortConfig, setSortConfig } = useLibrary();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const router = useRouter();
  const { openItem } = useLocalSearchParams<{ openItem?: string | string[] }>();
  const handledOpenItemRef = useRef<string | null>(null);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const toggleViewMode = useCallback(() => setViewMode(viewMode === 'grid' ? 'list' : 'grid'), [viewMode]);

  useEffect(() => {
    if (!openItem) {
      handledOpenItemRef.current = null;
      return;
    }

    const itemId = Array.isArray(openItem) ? openItem[0] : openItem;
    if (!itemId || handledOpenItemRef.current === itemId) {
      return;
    }

    handledOpenItemRef.current = itemId;
    router.setParams({ openItem: undefined });
    router.push(`/library/${itemId}`);
  }, [openItem, router]);

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
    { field: 'title' as SortField, label: translate('library.sortOptions.title') },
    { field: 'author' as SortField, label: translate('library.sortOptions.author') },
    { field: 'publishedYear' as SortField, label: translate('library.sortOptions.publishedYear') },
    { field: 'addedAt' as SortField, label: translate('library.sortOptions.dateAdded') },
  ];

  if (!libraries.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>{translate('library.empty')}</Text>
        <Button title={translate('common.refresh')} onPress={onRefresh} />
      </View>
    );
  }

  const title = selectedLibrary?.name || translate('library.title');

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
