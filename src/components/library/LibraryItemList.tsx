import { useThemedStyles } from '@/lib/theme';
import { usePlayer } from '@/stores';
import type { LibraryItemListRow } from '@/types/database';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
      <View style={{ position: 'relative' }}>
        <TextInput
          placeholder="Search by author, title, series, or narrator..."
          placeholderTextColor={isDark ? '#888' : '#999'}
          style={{
            backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA',
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingRight: searchQuery ? 40 : 12,
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
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => onSearchChange('')}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: [{ translateY: -10 }],
              padding: 4,
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text style={{ fontSize: 18, color: isDark ? '#888' : '#999' }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  ) : null;

  // Calculate numColumns: use dynamic columns for grid when fewer than 3 items
  const numColumns = React.useMemo(() => {
    if (viewMode === 'list') {
      return 1;
    }
    // For grid mode, always use 3 columns to maintain consistent layout
    // This prevents items from shrinking when filtered to 1-2 items
    return 3;
  }, [viewMode]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <FlatList
        data={items}
        numColumns={numColumns}
        key={`${viewMode}-${numColumns}`} // Force re-render when view mode or columns change
        columnWrapperStyle={viewMode === 'grid' && numColumns > 1 ? { gap: 12, paddingHorizontal: 12 } : undefined}
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
            ...(viewMode === 'grid' && { paddingHorizontal: 12 }),
          }
        ]}
        indicatorStyle={isDark ? 'white' : 'black'}
      />
    </View>
  );
}
