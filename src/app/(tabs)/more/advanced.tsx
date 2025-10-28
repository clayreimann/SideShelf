import { db } from '@/db/client';
import { statisticsHelpers } from '@/db/helpers';
import {
  clearAllLocalCovers,
  getAllDownloadedAudioFiles,
  getAllDownloadedLibraryFiles,
  getAllLocalCovers,
} from '@/db/helpers/localData';
import { audioFiles } from '@/db/schema/audioFiles';
import { libraryFiles } from '@/db/schema/libraryFiles';
import { mediaMetadata } from '@/db/schema/mediaMetadata';
import { clearAllCoverCache } from '@/lib/covers';
import { formatBytes } from '@/lib/helpers/formatters';
import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useDb } from '@/providers/DbProvider';
import { useLibrary } from '@/stores';
import { inArray } from 'drizzle-orm';
import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import { Stack } from 'expo-router';
import { defaultDatabaseDirectory } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';

type Section = {
  title: string;
  data: ActionItem[];
};

type ActionItem = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  columns?: [string, string, string];
  isHeader?: boolean;
};

type StorageBucketStats = {
  count: number;
  size: number;
};

type StorageEntry = {
  id: string;
  title: string;
  count: number;
  size: number;
};

const disabledOnPress = () => undefined;

function collectFileStats(paths: string[]): StorageBucketStats {
  return paths.reduce<StorageBucketStats>(
    (acc, path) => {
      if (!path) {
        return acc;
      }

      try {
        const file = new File(path);
        if (!file.exists) {
          return acc;
        }

        return {
          count: acc.count + 1,
          size: acc.size + (file.size ?? 0),
        };
      } catch (error) {
        console.warn('[Advanced] Failed to inspect file:', error);
        return acc;
      }
    },
    { count: 0, size: 0 }
  );
}

function getSQLiteDirectory(): Directory {
  if (defaultDatabaseDirectory) {
    return new Directory(defaultDatabaseDirectory);
  }

  return new Directory(Paths.document, 'SQLite');
}

function formatFileCount(count: number): string {
  if (count === 1) {
    return '1 file';
  }

  return `${count} files`;
}

function normalizeTitle(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown item';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 'Unknown item';
  }

  return trimmed;
}

export default function AdvancedScreen() {
  const { styles, isDark } = useThemedStyles();
  const { accessToken, logout } = useAuth();
  const { refresh, selectedLibrary, libraries } = useLibrary();
  const { resetDatabase } = useDb();
  const [counts, setCounts] = useState<{
    authors: number;
    genres: number;
    languages: number;
    narrators: number;
    series: number;
    tags: number;
  }>({
    authors: 0,
    genres: 0,
    languages: 0,
    narrators: 0,
    series: 0,
    tags: 0,
  });

  const [storageEntries, setStorageEntries] = useState<StorageEntry[]>([]);

  const refreshCounts = useCallback(async () => {
    try {
      const newCounts = await statisticsHelpers.getAllCounts();
      setCounts(newCounts);
    } catch (error) {
      console.error('Failed to fetch counts:', error);
    }
  }, []);

  const refreshStorageStats = useCallback(async () => {
    try {
      const [coverRows, audioRows, libraryRows] = await Promise.all([
        getAllLocalCovers(),
        getAllDownloadedAudioFiles(),
        getAllDownloadedLibraryFiles(),
      ]);

      const sqliteDirectory = getSQLiteDirectory();
      const metadataDbFile = new File(sqliteDirectory, 'abs2.sqlite');
      const logDbFile = new File(sqliteDirectory, 'logs.sqlite');
      const covers = collectFileStats(coverRows.map((row) => row.localCoverUrl));

      const metadataStats: StorageBucketStats = metadataDbFile.exists
        ? { count: 1, size: metadataDbFile.size ?? 0 }
        : { count: 0, size: 0 };

      const logStats: StorageBucketStats = logDbFile.exists
        ? { count: 1, size: logDbFile.size ?? 0 }
        : { count: 0, size: 0 };

      const downloadsByLibraryItem = new Map<string, { title: string; paths: string[] }>();

      const audioFileIds = audioRows.map((row) => row.audioFileId).filter(Boolean);
      const libraryFileIds = libraryRows.map((row) => row.libraryFileId).filter(Boolean);

      const audioFileInfos =
        audioFileIds.length > 0
          ? await db
              .select({
                id: audioFiles.id,
                mediaId: audioFiles.mediaId,
              })
              .from(audioFiles)
              .where(inArray(audioFiles.id, audioFileIds))
          : [];

      const mediaIds = Array.from(
        new Set(
          audioFileInfos
            .map((info) => info.mediaId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      );

      const metadataRows =
        mediaIds.length > 0
          ? await db
              .select({
                id: mediaMetadata.id,
                libraryItemId: mediaMetadata.libraryItemId,
                title: mediaMetadata.title,
              })
              .from(mediaMetadata)
              .where(inArray(mediaMetadata.id, mediaIds))
          : [];

      const metadataByMediaId = new Map<string, { libraryItemId: string; title: string | null }>();
      const libraryTitleById = new Map<string, string>();

      const ensureLibraryItemTitle = (libraryItemId: string, fallbackTitle?: string | null): string => {
        const existing = libraryTitleById.get(libraryItemId);
        if (existing) {
          return existing;
        }
        const normalized = normalizeTitle(fallbackTitle);
        libraryTitleById.set(libraryItemId, normalized);
        return normalized;
      };

      metadataRows.forEach((row) => {
        metadataByMediaId.set(row.id, { libraryItemId: row.libraryItemId, title: row.title });
        ensureLibraryItemTitle(row.libraryItemId, row.title);
      });

      const libraryFileInfos =
        libraryFileIds.length > 0
          ? await db
              .select({
                id: libraryFiles.id,
                libraryItemId: libraryFiles.libraryItemId,
              })
              .from(libraryFiles)
              .where(inArray(libraryFiles.id, libraryFileIds))
          : [];

      const missingLibraryItemIds = Array.from(
        new Set(
          libraryFileInfos
            .map((info) => info.libraryItemId)
            .filter(
              (libraryItemId): libraryItemId is string =>
                typeof libraryItemId === 'string' &&
                libraryItemId.length > 0 &&
                !libraryTitleById.has(libraryItemId)
            )
        )
      );

      if (missingLibraryItemIds.length > 0) {
        const additionalMetadataRows = await db
          .select({
            libraryItemId: mediaMetadata.libraryItemId,
            title: mediaMetadata.title,
          })
          .from(mediaMetadata)
          .where(inArray(mediaMetadata.libraryItemId, missingLibraryItemIds));

        additionalMetadataRows.forEach((row) => {
          ensureLibraryItemTitle(row.libraryItemId, row.title);
        });
      }

      const audioFileInfoMap = new Map(audioFileInfos.map((info) => [info.id, info.mediaId]));
      const libraryFileInfoMap = new Map(libraryFileInfos.map((info) => [info.id, info.libraryItemId]));

      const addDownloadToGroup = (libraryItemId: string, title: string, path: string) => {
        if (!libraryItemId || !path) {
          return;
        }

        const existing = downloadsByLibraryItem.get(libraryItemId);
        if (existing) {
          existing.paths.push(path);
        } else {
          downloadsByLibraryItem.set(libraryItemId, {
            title,
            paths: [path],
          });
        }
      };

      audioRows.forEach((row) => {
        const mediaId = audioFileInfoMap.get(row.audioFileId);
        if (!mediaId) {
          return;
        }

        const metadata = metadataByMediaId.get(mediaId);
        if (!metadata) {
          return;
        }

        const title = ensureLibraryItemTitle(metadata.libraryItemId, metadata.title);
        addDownloadToGroup(metadata.libraryItemId, title, row.downloadPath);
      });

      libraryRows.forEach((row) => {
        const libraryItemId = libraryFileInfoMap.get(row.libraryFileId);
        if (!libraryItemId) {
          return;
        }

        const title = ensureLibraryItemTitle(libraryItemId);
        addDownloadToGroup(libraryItemId, title, row.downloadPath);
      });

      const entries: StorageEntry[] = [
        {
          id: 'metadata-db',
          title: 'Metadata database',
          count: metadataStats.count,
          size: metadataStats.size,
        },
        {
          id: 'log-db',
          title: 'Log database',
          count: logStats.count,
          size: logStats.size,
        },
        {
          id: 'cover-cache',
          title: 'Cover cache',
          count: covers.count,
          size: covers.size,
        },
      ];

      const downloadEntries = Array.from(downloadsByLibraryItem.entries())
        .map(([libraryItemId, group]) => {
          const stats = collectFileStats(group.paths);
          return {
            id: `downloads-${libraryItemId}`,
            title: group.title,
            count: stats.count,
            size: stats.size,
          };
        })
        .filter((entry) => entry.count > 0)
        .sort((a, b) => a.title.localeCompare(b.title));

      setStorageEntries([...entries, ...downloadEntries]);
    } catch (error) {
      console.error('Failed to refresh storage stats:', error);
      setStorageEntries([]);
    }
  }, []);

  const handleRefreshCounts = useCallback(async () => {
    await Promise.all([refreshCounts(), refreshStorageStats()]);
  }, [refreshCounts, refreshStorageStats]);

  const clearCoverCache = useCallback(async () => {
    try {
      await clearAllCoverCache();
      await clearAllLocalCovers();
      console.log('Cover cache and database imageUrls cleared successfully');
    } catch (error) {
      console.error('Failed to clear cover cache:', error);
    }
    await refreshStorageStats();
  }, [refreshStorageStats]);

  useEffect(() => {
    void refreshCounts();
    void refreshStorageStats();
  }, [refreshCounts, refreshStorageStats]);

  const sections = useMemo<Section[]>(() => {
    const librarySection: Section = {
      title: 'Library Stats',
      data: [
        { label: `Libraries found: ${libraries.length}`, onPress: disabledOnPress, disabled: true },
        { label: `Selected library: ${selectedLibrary?.name ?? 'None'}`, onPress: disabledOnPress, disabled: true },
        { label: `Authors: ${counts.authors}`, onPress: disabledOnPress, disabled: true },
        { label: `Genres: ${counts.genres}`, onPress: disabledOnPress, disabled: true },
        { label: `Languages: ${counts.languages}`, onPress: disabledOnPress, disabled: true },
        { label: `Narrators: ${counts.narrators}`, onPress: disabledOnPress, disabled: true },
        { label: `Series: ${counts.series}`, onPress: disabledOnPress, disabled: true },
        { label: `Tags: ${counts.tags}`, onPress: disabledOnPress, disabled: true },
      ],
    };

    const storageSection: Section = {
      title: 'Storage',
      data: [
        {
          label: 'storage-header',
          onPress: disabledOnPress,
          disabled: true,
          columns: ['Storage item', 'Files', 'Size'],
          isHeader: true,
        },
        ...storageEntries.map((entry) => ({
          label: entry.id,
          onPress: disabledOnPress,
          disabled: true,
          columns: [entry.title, formatFileCount(entry.count), formatBytes(entry.size)] as [string, string, string],
        })),
      ],
    };

    const actionsSection: Section = {
      title: 'Actions',
      data: [
        {
          label: 'Copy access token to clipboard',
          onPress: async () => {
            if (accessToken) {
              await Clipboard.setStringAsync(accessToken);
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
          onPress: handleRefreshCounts,
          disabled: false,
        },
        {
          label: 'Clear cover cache',
          onPress: clearCoverCache,
          disabled: false,
        },
        {
          label: 'Reset app',
          onPress: async () => {
            resetDatabase();
            await clearCoverCache();
            await logout();
          },
          disabled: false,
        },
      ],
    };

    return [actionsSection, librarySection, storageSection];
  }, [
    libraries,
    selectedLibrary,
    counts,
    storageEntries,
    accessToken,
    refresh,
    handleRefreshCounts,
    clearCoverCache,
    resetDatabase,
    logout,
  ]);

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item.label + index}
        renderSectionHeader={({ section: { title } }) => (
          <View style={{ marginBottom: 12, marginTop: 20, paddingHorizontal: 16 }}>
            <Text style={{ ...styles.text, fontWeight: 'bold', fontSize: 18 }}>{title}</Text>
          </View>
        )}
        renderItem={({ item }: { item: ActionItem }) => {
          if (item.columns) {
            return (
              <View
                style={[
                  styles.listItem,
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.text,
                    { flex: 1 },
                    item.isHeader && { fontWeight: '600' },
                  ]}
                >
                  {item.columns[0]}
                </Text>
                <Text
                  style={[
                    styles.text,
                    { width: 90, textAlign: 'right' },
                    item.isHeader && { fontWeight: '600' },
                  ]}
                >
                  {item.columns[1]}
                </Text>
                <Text
                  style={[
                    styles.text,
                    { width: 110, textAlign: 'right' },
                    item.isHeader && { fontWeight: '600' },
                  ]}
                >
                  {item.columns[2]}
                </Text>
              </View>
            );
          }

          return (
            <View style={styles.listItem}>
              <Pressable onPress={item.onPress} disabled={item.disabled}>
                <Text style={item.disabled ? styles.text : styles.link}>{item.label}</Text>
              </Pressable>
            </View>
          );
        }}
        contentContainerStyle={[styles.flatListContainer, { paddingBottom: 80 }]}
        indicatorStyle={isDark ? 'white' : 'black'}
        stickySectionHeadersEnabled={false}
      />
      <Stack.Screen options={{ title: 'Advanced' }} />
    </>
  );
}
