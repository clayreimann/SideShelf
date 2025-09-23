import { useThemedStyles } from '@/lib/theme';
import { LibraryItemListRow } from '@/stores';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { GridItem, ListItem } from './LibraryItem';

type ViewMode = 'grid' | 'list';

interface LibraryItemListProps {
  items: LibraryItemListRow[];
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
  viewMode?: ViewMode;
}

export default function LibraryItemList({
  items,
  isLoading = false,
  onRefresh,
  viewMode = 'grid'
}: LibraryItemListProps) {
  const { styles, isDark } = useThemedStyles();
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    </View>
  );
}
