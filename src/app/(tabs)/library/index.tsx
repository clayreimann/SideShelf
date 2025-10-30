import { LibraryItemList, LibraryPicker } from '@/components/library';
import { HeaderControls } from '@/components/ui';
import { translate } from '@/i18n';
import { useThemedStyles } from '@/lib/theme';
import { SortField, useLibrary } from '@/stores';
import type { LibraryItemDisplayRow } from '@/types/components';
import type { SortConfig } from '@/types/store';
import { MenuAction } from '@react-native-menu/menu';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Platform, Text, View } from 'react-native';

export default function LibraryScreen() {
  const { styles, isDark, colors } = useThemedStyles();
  const { libraries, items, selectLibrary, selectedLibrary, isLoadingItems, refresh, sortConfig, setSortConfig } = useLibrary();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const { openItem } = useLocalSearchParams<{ openItem?: string | string[] }>();
  const handledOpenItemRef = useRef<string | null>(null);

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const toggleViewMode = useCallback(() => setViewMode(viewMode === 'grid' ? 'list' : 'grid'), [viewMode]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return items;
    }

    const query = searchQuery.toLowerCase().trim();
    return items.filter((item: LibraryItemDisplayRow) => {
      const titleMatch = item.title?.toLowerCase().includes(query) ?? false;
      const authorMatch = item.author?.toLowerCase().includes(query) ?? false;
      const authorNameMatch = item.authorName?.toLowerCase().includes(query) ?? false;
      const narratorMatch = item.narrator?.toLowerCase().includes(query) ?? false;
      const seriesMatch = item.seriesName?.toLowerCase().includes(query) ?? false;

      return titleMatch || authorMatch || authorNameMatch || narratorMatch || seriesMatch;
    });
  }, [items, searchQuery]);

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

  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config);
  }, [setSortConfig]);

  const librarySortOptions = [
    { field: 'title' as SortField, label: translate('library.sortOptions.title') },
    { field: 'authorName' as SortField, label: translate('library.sortOptions.authorFirstName') },
    { field: 'authorNameLF' as SortField, label: translate('library.sortOptions.authorLastName') },
    { field: 'publishedYear' as SortField, label: translate('library.sortOptions.publishedYear') },
    { field: 'addedAt' as SortField, label: translate('library.sortOptions.dateAdded') },
  ];

  const controls = useCallback(() => {
    const sortActions: Array<MenuAction> = librarySortOptions.map(option => {
      const isActive = sortConfig.field === option.field;
      const isAscending = sortConfig.direction === 'asc';

      return {
        id: option.field,
        title: option.label,
        state: isActive ? 'on' : 'off',
        ...(isActive ? {
          image: Platform.select({
            ios: isAscending ? 'arrowtriangle.up' : 'arrowtriangle.down',
            android: isAscending ? 'ic_menu_sort_alphabetically' : 'ic_menu_sort_by_size',
          }),
          imageColor: colors.textPrimary,
        } : {}),
      };
    });

    return (
      <HeaderControls
        isDark={isDark}
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
        onSort={() => {}}
        sortConfig={sortConfig}
        sortMenuActions={sortActions}
        onSortMenuAction={(field) => {
          const direction: 'asc' | 'desc' =
            sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
          handleSortChange({ field, direction });
        }}
      />
    );
  }, [isDark, viewMode, toggleViewMode, sortConfig, handleSortChange, librarySortOptions]);


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
        {!selectedLibrary && (
          <LibraryPicker
            libraries={libraries}
            selectLibrary={selectLibrary}
            selectedLibrary={selectedLibrary}
            isDark={isDark}
          />
        )}
        <LibraryItemList
          items={filteredItems}
          isLoading={isLoadingItems}
          onRefresh={onRefresh}
          viewMode={viewMode}
          searchQuery={selectedLibrary ? searchQuery : undefined}
          onSearchChange={selectedLibrary ? setSearchQuery : undefined}
        />
        <Stack.Screen options={{ title, headerTitle: title, headerRight: controls }} />
      </View>
    </>
  );
}
