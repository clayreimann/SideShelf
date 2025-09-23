import { HeaderControls, SortMenu } from '@/components/ui';
import { useThemedStyles } from '@/lib/theme';
import { SeriesSortField, useSeries } from '@/stores';
import { Stack } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';

export default function SeriesScreen() {
  const { styles, isDark } = useThemedStyles();
  const { items, isLoadingItems, isInitializing, ready, refetchSeries, sortConfig, setSortConfig } = useSeries();
  const [showSortMenu, setShowSortMenu] = useState(false);

  const onRefresh = useCallback(async () => {
    await refetchSeries();
  }, [refetchSeries]);

  const controls = useCallback(() => (
    <HeaderControls
      isDark={isDark}
      onSort={() => setShowSortMenu(true)}
      showViewToggle={false}
    />
  ), [isDark]);

  // Series sort options
  const seriesSortOptions = [
    { field: 'name' as SeriesSortField, label: 'Name' },
    { field: 'addedAt' as SeriesSortField, label: 'Date Added' },
    { field: 'updatedAt' as SeriesSortField, label: 'Last Updated' },
  ];

  const renderSeries = React.useCallback(({ item }: { item: any }) => (
    <View style={{
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: styles.text.color + '20',
    }}>
      <Text style={[styles.text, { fontSize: 16, fontWeight: '600' }]}>
        {item.name}
      </Text>
      {item.description && (
        <Text style={[styles.text, { fontSize: 14, opacity: 0.7, marginTop: 4 }]} numberOfLines={2}>
          {item.description}
        </Text>
      )}
      {item.updatedAt && (
        <Text style={[styles.text, { fontSize: 12, opacity: 0.5, marginTop: 4 }]}>
          Updated: {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
      )}
    </View>
  ), [styles]);

  if (!ready || isInitializing) {
    return (
      <>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" />
          <Text style={[styles.text, { marginTop: 16 }]}>Loading series...</Text>
          <Stack.Screen options={{ title: 'Series', headerTitle: 'Series' }} />
        </View>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={styles.text}>No series found</Text>
          <Text style={[styles.text, { fontSize: 12, marginTop: 8, opacity: 0.7 }]}>
            Series will appear here once you have books that are part of a series
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            style={{
              marginTop: 20,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 6,
              backgroundColor: isDark ? '#333' : '#f0f0f0',
            }}
          >
            <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16 }}>
              Reload Series
            </Text>
          </TouchableOpacity>
          <Stack.Screen options={{ title: 'Series', headerTitle: 'Series' }} />
        </View>
      </>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <FlatList
          data={items}
          renderItem={renderSeries}
          keyExtractor={(item) => item.id}
          refreshing={isLoadingItems}
          onRefresh={onRefresh}
          contentContainerStyle={{ flexGrow: 1 }}
        />
        <SortMenu
          visible={showSortMenu}
          onClose={() => setShowSortMenu(false)}
          sortConfig={sortConfig}
          onSortChange={setSortConfig}
          sortOptions={seriesSortOptions}
          isDark={isDark}
        />
        <Stack.Screen options={{ title: 'Series', headerTitle: `Series (${items.length})`, headerRight: controls }} />
      </View>
    </>
  );
}
