import { statisticsHelpers } from '@/db/helpers';
import { clearAllLocalCovers } from '@/db/helpers/localData';
import { clearAllCoverCache } from '@/lib/covers';
import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useDb } from '@/providers/DbProvider';
import { useLibrary } from '@/stores';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

type ActionItem = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function AdvancedScreen() {
  const { styles, isDark } = useThemedStyles();
  const { accessToken } = useAuth();
  const { refresh, selectedLibrary, libraries } = useLibrary();
  const { resetDatabase } = useDb();
  const [counts, setCounts] = useState({
    authors: 0,
    genres: 0,
    languages: 0,
    narrators: 0,
    series: 0,
    tags: 0,
  });

  const refreshCounts = useCallback(async () => {
    try {
      const newCounts = await statisticsHelpers.getAllCounts();
      setCounts(newCounts);
    } catch (error) {
      console.error('Failed to fetch counts:', error);
    }
  }, []);

  const clearCoverCache = useCallback(async () => {
    try {
      await clearAllCoverCache();
      await clearAllLocalCovers();
      console.log('Cover cache and database imageUrls cleared successfully');
    } catch (error) {
      console.error('Failed to clear cover cache:', error);
    }
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const data = useMemo<ActionItem[]>(() => {
    return [
      {
        label: `Libraries found: ${libraries.length}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: `Selected library: ${selectedLibrary?.name}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: `Authors: ${counts.authors}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: `Genres: ${counts.genres}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: `Languages: ${counts.languages}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: `Narrators: ${counts.narrators}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: `ApiSeries: ${counts.series}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: `Tags: ${counts.tags}`,
        onPress: () => {},
        disabled: true,
      },
      {
        label: 'Copy access token to clipboard',
        onPress: async () => {
          const { setStringAsync } = await import('expo-clipboard');
          if (accessToken) {
            await setStringAsync(accessToken);
          }
        },
        disabled: !accessToken,
      },
      {
        label: 'Refresh libraries and items',
        onPress: refresh,
        disabled: false,
      },
      {
        label: 'Refresh counts',
        onPress: refreshCounts,
        disabled: false,
      },
      {
        label: 'Clear cover cache',
        onPress: clearCoverCache,
        disabled: false,
      },
      {
        label: 'Reset database',
        onPress: resetDatabase,
        disabled: false,
      },
    ];
  }, [selectedLibrary, libraries, counts, refresh, refreshCounts, resetDatabase, accessToken, clearCoverCache]);

  return (
    <>
      <FlatList
        data={data}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <Pressable onPress={item.onPress} disabled={item.disabled}>
              <Text style={styles.text}>{item.label}</Text>
            </Pressable>
          </View>
        )}
        contentContainerStyle={styles.flatListContainer}
        indicatorStyle={isDark ? 'white' : 'black'}
      />
      <Stack.Screen options={{ title: 'Advanced' }} />
    </>
  );
}
