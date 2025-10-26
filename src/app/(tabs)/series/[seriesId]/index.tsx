import CoverImage from '@/components/ui/CoverImange';
import { SeriesBookRow } from '@/db/helpers/series';
import { formatTime } from '@/lib/helpers/formatters';
import { useThemedStyles } from '@/lib/theme';
import { useSeries } from '@/stores';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function SeriesDetailScreen() {
  const { styles, colors } = useThemedStyles();
  const {
    series: seriesList,
    ready,
    isInitializing,
    isLoadingItems,
    refetchSeries,
  } = useSeries();
  const router = useRouter();
  const params = useLocalSearchParams<{ seriesId?: string | string[] }>();
  const seriesId = Array.isArray(params.seriesId) ? params.seriesId[0] : params.seriesId;

  const selectedSeries = useMemo(
    () => seriesList.find(serie => serie.id === seriesId),
    [seriesList, seriesId]
  );

  useFocusEffect(
    useCallback(() => {
      if (!ready || selectedSeries) return;
      refetchSeries().catch(error => {
        console.error('[SeriesDetailScreen] Failed to refetch series:', error);
      });
    }, [ready, selectedSeries, refetchSeries])
  );

  const handleRefresh = useCallback(async () => {
    await refetchSeries();
  }, [refetchSeries]);

  const renderBook = useCallback(
    ({ item }: { item: SeriesBookRow }) => {
      const sequenceLabel = item.sequence ? `Book ${item.sequence}` : null;
      return (
        <TouchableOpacity
          onPress={() => seriesId && router.push(`/series/${seriesId}/item/${item.libraryItemId}`)}
          style={{
            flexDirection: 'row',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: (styles.text.color || '#000000') + '20',
            gap: 12,
          }}
          accessibilityRole="button"
          accessibilityHint={`Open details for ${item.title}`}
        >
          <View style={{ width: 64, height: 96, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.coverBackground }}>
            <CoverImage uri={item.coverUrl} title={item.title} fontSize={12} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={[styles.text, { fontSize: 16, fontWeight: '600' }]} numberOfLines={2}>
              {item.title}
            </Text>
            {item.authorName && (
              <Text style={[styles.text, { opacity: 0.7, marginTop: 2 }]} numberOfLines={1}>
                {item.authorName}
              </Text>
            )}
            {sequenceLabel && (
              <Text style={[styles.text, { opacity: 0.6, fontSize: 12, marginTop: 4 }]}>
                {sequenceLabel}
              </Text>
            )}
            {item.duration !== null && (
              <Text style={[styles.text, { opacity: 0.6, fontSize: 12, marginTop: 2 }]}>
                {formatTime(item.duration)}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [colors.coverBackground, router, seriesId, styles.text.color]
  );

  if (!seriesId) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.text}>Series not found.</Text>
        <Stack.Screen options={{ title: 'Series' }} />
      </View>
    );
  }

  if (!ready || isInitializing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.link} />
        <Text style={[styles.text, { marginTop: 12, opacity: 0.7 }]}>
          Loading series...
        </Text>
        <Stack.Screen options={{ title: 'Series' }} />
      </View>
    );
  }

  if (!selectedSeries) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }]}>
        <Text style={[styles.text, { textAlign: 'center', marginBottom: 16 }]}>
          We could not find that series. Try refreshing to sync the latest data.
        </Text>
        <TouchableOpacity
          onPress={handleRefresh}
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 6,
            backgroundColor: colors.separator,
          }}
        >
          <Text style={[styles.text, { fontWeight: '600' }]}>Refresh</Text>
        </TouchableOpacity>
        <Stack.Screen options={{ title: 'Series' }} />
      </View>
    );
  }

  const headerTitle = `${selectedSeries.name || 'Series'} (${selectedSeries.books.length})`;

  return (
    <>
      <FlatList
        data={selectedSeries.books}
        keyExtractor={(item) => item.libraryItemId}
        renderItem={renderBook}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
            <Text style={[styles.text, { fontSize: 24, fontWeight: '700' }]} numberOfLines={2}>
              {selectedSeries.name}
            </Text>
            {selectedSeries.description && (
              <Text style={[styles.text, { marginTop: 8, opacity: 0.8 }]}>
                {selectedSeries.description}
              </Text>
            )}
            <Text style={[styles.text, { marginTop: 8, opacity: 0.6, fontSize: 12 }]}>
              {selectedSeries.books.length === 1 ? '1 book' : `${selectedSeries.books.length} books`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={[styles.text, { opacity: 0.7 }]}>No books found in this series.</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={isLoadingItems} onRefresh={handleRefresh} tintColor={colors.link} />
        }
        contentContainerStyle={[styles.flatListContainer, { paddingBottom: 40 }]}
      />
      <Stack.Screen
        options={{
          title: selectedSeries.name || 'Series',
          headerTitle: headerTitle,
        }}
      />
    </>
  );
}
