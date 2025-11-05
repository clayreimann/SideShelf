import { useFloatingPlayerPadding } from '@/hooks/useFloatingPlayerPadding';
import { borderRadius, spacing } from '@/lib/styles';
import { useThemedStyles } from '@/lib/theme';
import type { LibraryItemListRow } from '@/types/database';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  const { styles, isDark, colors } = useThemedStyles();
  const floatingPlayerPadding = useFloatingPlayerPadding();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  }, [onRefresh]);

  const ListHeaderComponent = searchQuery !== undefined && onSearchChange ? (
    <View style={componentStyles.searchContainer}>
      <View style={componentStyles.searchInputWrapper}>
        <TextInput
          placeholder="Search by author, title, series, or narrator..."
          placeholderTextColor={isDark ? '#888' : '#999'}
          style={[
            componentStyles.searchInput,
            {
              backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA',
              borderColor: isDark ? '#3A3A3C' : '#C7C7CC',
              color: colors.textPrimary,
              paddingRight: searchQuery ? 40 : spacing.md,
            },
          ]}
          value={searchQuery}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => onSearchChange('')}
            style={componentStyles.clearButton}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text style={componentStyles.clearButtonText}>✕</Text>
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
    <View style={componentStyles.container}>
      <FlatList
        data={items}
        numColumns={numColumns}
        key={`${viewMode}-${numColumns}`} // Force re-render when view mode or columns change
        columnWrapperStyle={
          viewMode === 'grid' && numColumns > 1
            ? componentStyles.gridColumnWrapper
            : undefined
        }
        renderItem={({ item }: { item: LibraryItemListRow }) => (
          <LibraryItem item={item} variant={viewMode} />
        )}
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
          componentStyles.contentContainer,
          floatingPlayerPadding,
          viewMode === 'list' && componentStyles.listPadding,
          viewMode === 'grid' && componentStyles.gridPadding,
        ]}
        indicatorStyle={isDark ? 'white' : 'black'}
      />
    </View>
  );
}

const componentStyles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInputWrapper: {
    position: 'relative',
  },
  searchInput: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
  },
  clearButton: {
    position: 'absolute',
    right: spacing.sm,
    top: '50%',
    transform: [{ translateY: -10 }],
    padding: spacing.xs,
  },
  clearButtonText: {
    fontSize: 18,
    color: '#888',
  },
  gridColumnWrapper: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  contentContainer: {
    paddingTop: spacing.sm,
  },
  listPadding: {
    paddingHorizontal: 0,
  },
  gridPadding: {
    paddingHorizontal: spacing.md,
  },
});
