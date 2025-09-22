import { useThemedStyles } from '@/lib/theme';
import { LibraryItemListRow, SortConfig } from '@/providers/LibraryProvider';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import SortMenu from '../ui/SortMenu';
import { GridItem, ListItem } from './LibraryItem';

type ViewMode = 'grid' | 'list';

interface LibraryItemListProps {
  items: LibraryItemListRow[];
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  viewMode?: 'grid' | 'list';
}

export default function LibraryItemList({
  items,
  isLoading = false,
  onRefresh,
  sortConfig,
  onSortChange,
  viewMode = 'grid'
}: LibraryItemListProps) {
  const { styles, isDark } = useThemedStyles();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  }, [onRefresh]);


  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        numColumns={viewMode === 'grid' ? 3 : 1}
        key={viewMode} // Force re-render when view mode changes
        columnWrapperStyle={viewMode === 'grid' ? { gap: 12, paddingHorizontal: 12 } : undefined}
        renderItem={({ item }: { item: LibraryItemListRow }) =>
          viewMode === 'grid' ?
            <GridItem item={item} isDark={isDark} /> :
            <ListItem item={item} isDark={isDark} />
        }
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing || isLoading}
              onRefresh={handleRefresh}
              tintColor={isDark ? '#fff' : '#000'}
            />
          ) : undefined
        }
        contentContainerStyle={[
          styles.flatListContainer,
          {
            paddingTop: 8,
            paddingBottom: 24,
            ...(viewMode === 'list' && { paddingHorizontal: 0 })
          }
        ]}
        indicatorStyle={isDark ? 'white' : 'black'}
      />
      <SortMenu
        visible={showSortMenu}
        onClose={() => setShowSortMenu(false)}
        sortConfig={sortConfig}
        onSortChange={onSortChange}
        isDark={isDark}
      />
    </View>
  );
}
