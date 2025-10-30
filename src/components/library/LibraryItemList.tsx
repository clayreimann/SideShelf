import { useThemedStyles } from '@/lib/theme';
import { usePlayer } from '@/stores';
import type { LibraryItemListRow } from '@/types/database';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';
import LibraryItem from './LibraryItem';

type ViewMode = 'grid' | 'list';

interface LibraryItemListProps {
  items: LibraryItemListRow[];
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
  viewMode?: ViewMode;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export default function LibraryItemList({
  items,
  isLoading = false,
  onRefresh,
  viewMode = 'grid',
  searchQuery = '',
  onSearchChange,
}: LibraryItemListProps) {
  const { styles, tabs, isDark, colors } = useThemedStyles();
  const { currentTrack } = usePlayer();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  }, [onRefresh]);

  const ListHeaderComponent = searchQuery !== undefined && onSearchChange ? (
    <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
      <TextInput
        placeholder="Search by author, title, series, or narrator..."
        placeholderTextColor={isDark ? '#888' : '#999'}
        style={{
          backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA',
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 16,
          color: colors.textPrimary,
          borderWidth: 1,
          borderColor: isDark ? '#3A3A3C' : '#C7C7CC',
        }}
        value={searchQuery}
        onChangeText={onSearchChange}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        numColumns={viewMode === 'grid' ? 3 : 1}
        key={viewMode} // Force re-render when view mode changes
        columnWrapperStyle={viewMode === 'grid' ? { gap: 12, paddingHorizontal: 12 } : undefined}
        renderItem={({ item }: { item: LibraryItemListRow }) =>
          <LibraryItem item={item} variant={viewMode} />
        }
        ListHeaderComponent={ListHeaderComponent}
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
            paddingBottom: (currentTrack ? 76 : 0) + tabs.tabBarSpace,
            ...(viewMode === 'list' && { paddingHorizontal: 0 }),
            justifyContent: 'center',
          }
        ]}
        indicatorStyle={isDark ? 'white' : 'black'}
      />
    </View>
  );
}
