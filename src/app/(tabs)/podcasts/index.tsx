import { LibraryItemList, LibraryPicker } from '@/components/library';
import { HeaderControls } from '@/components/ui';
import { translate } from '@/i18n';
import { useThemedStyles } from '@/lib/theme';
import { SortField, usePodcasts } from '@/stores';
import type { LibraryItemDisplayRow } from '@/types/components';
import type { SortConfig } from '@/types/store';
import { MenuAction } from '@react-native-menu/menu';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

export default function PodcastsScreen() {
  const { styles, isDark, colors } = useThemedStyles();
  const { podcastLibraries, items, selectPodcastLibrary, selectedPodcastLibrary, isLoadingItems, refreshPodcasts, sortConfig, setSortConfig } = usePodcasts();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const { openItem } = useLocalSearchParams<{ openItem?: string | string[] }>();
  const handledOpenItemRef = useRef<string | null>(null);

  const onRefresh = useCallback(async () => {
    await refreshPodcasts();
  }, [refreshPodcasts]);

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

      return titleMatch || authorMatch || authorNameMatch;
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
    router.push(`/library/${itemId}`); // Reuse library item detail screen
  }, [openItem, router]);

  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config);
  }, [setSortConfig]);

  const podcastSortOptions = [
    { field: 'title' as SortField, label: translate('podcasts.sortOptions.title') },
    { field: 'authorName' as SortField, label: translate('podcasts.sortOptions.author') },
    { field: 'addedAt' as SortField, label: translate('podcasts.sortOptions.dateAdded') },
  ];

  const controls = useCallback(() => {
    const sortActions: Array<MenuAction> = podcastSortOptions.map(option => {
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
        onSortChange={handleSortChange}
      />
    );
  }, [isDark, viewMode, toggleViewMode, sortConfig, handleSortChange, colors.textPrimary, podcastSortOptions]);

  return (
    <View style={[styles.container]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: translate('podcasts.title'),
          headerRight: controls,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.textPrimary },
        }}
      />

      <LibraryPicker
        libraries={podcastLibraries}
        selectLibrary={selectPodcastLibrary}
        selectedLibrary={selectedPodcastLibrary}
        isDark={isDark}
      />

      <LibraryItemList
        items={filteredItems}
        viewMode={viewMode}
        isDark={isDark}
        isRefreshing={isLoadingItems}
        onRefresh={onRefresh}
        searchEnabled
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={translate('podcasts.searchPlaceholder')}
        emptyMessage={translate('podcasts.empty')}
      />
    </View>
  );
}
