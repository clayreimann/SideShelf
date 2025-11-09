import { db } from "@/db/client";
import {
  clearAllLocalCovers,
  getAllDownloadedAudioFiles,
  getAllDownloadedLibraryFiles,
  getAllLocalCovers,
} from "@/db/helpers/localData";
import { audioFiles } from "@/db/schema/audioFiles";
import { libraryFiles } from "@/db/schema/libraryFiles";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { clearAllCoverCache } from "@/lib/covers";
import { formatBytes } from "@/lib/helpers/formatters";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useDb } from "@/providers/DbProvider";
import { type StorageEntry, useLibrary, useStatistics } from "@/stores";
import { inArray } from "drizzle-orm";
import * as Clipboard from "expo-clipboard";
import { Directory, File, Paths } from "expo-file-system";
import { Stack } from "expo-router";
import { defaultDatabaseDirectory } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import TrackPlayer, { State, Track } from "react-native-track-player";

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
        console.warn("[Advanced] Failed to inspect file:", error);
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

  return new Directory(Paths.document, "SQLite");
}

function formatFileCount(count: number): string {
  // Translation keys not needed here as this is formatted data
  if (count === 1) {
    return "1 file";
  }

  return `${count} files`;
}

function normalizeTitle(value: string | null | undefined): string {
  if (!value) {
    return translate("advanced.trackPlayer.unknownItem");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return translate("advanced.trackPlayer.unknownItem");
  }

  return trimmed;
}

function getStateLabel(state: State): string {
  switch (state) {
    case State.None:
      return translate("advanced.trackPlayer.states.none");
    case State.Ready:
      return translate("advanced.trackPlayer.states.ready");
    case State.Playing:
      return translate("advanced.trackPlayer.states.playing");
    case State.Paused:
      return translate("advanced.trackPlayer.states.paused");
    case State.Stopped:
      return translate("advanced.trackPlayer.states.stopped");
    case State.Buffering:
      return translate("advanced.trackPlayer.states.buffering");
    case State.Connecting:
      return translate("advanced.trackPlayer.states.connecting");
    case State.Error:
      return translate("advanced.trackPlayer.states.error");
    default:
      return translate("advanced.trackPlayer.states.unknown");
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function AdvancedScreen() {
  const { styles, isDark } = useThemedStyles();
  const { accessToken, logout } = useAuth();
  const { refresh, selectedLibrary, libraries } = useLibrary();
  const { resetDatabase } = useDb();
  const {
    counts,
    refreshStatistics,
    refreshStorageStats: updateStorageStatsInStore,
  } = useStatistics();
  const floatingPlayerPadding = useFloatingPlayerPadding();

  const [storageEntries, setStorageEntries] = useState<StorageEntry[]>([]);

  const [trackPlayerState, setTrackPlayerState] = useState<{
    state: string;
    queueLength: number;
    currentTrackIndex: number | null;
    currentTrack: Track | null;
    position: number;
    duration: number;
    buffered: number;
    rate: number;
    volume: number;
  }>({
    state: "Unknown",
    queueLength: 0,
    currentTrackIndex: null,
    currentTrack: null,
    position: 0,
    duration: 0,
    buffered: 0,
    rate: 1.0,
    volume: 1.0,
  });

  const refreshCounts = useCallback(async () => {
    try {
      await refreshStatistics();
    } catch (error) {
      console.error("Failed to fetch counts:", error);
    }
  }, [refreshStatistics]);

  const refreshTrackPlayerState = useCallback(async () => {
    try {
      const [state, queue, progress, rate, volume, activeTrackIndex] = await Promise.all([
        TrackPlayer.getPlaybackState(),
        TrackPlayer.getQueue(),
        TrackPlayer.getProgress(),
        TrackPlayer.getRate(),
        TrackPlayer.getVolume(),
        TrackPlayer.getActiveTrackIndex(),
      ]);

      const currentTrack =
        activeTrackIndex !== undefined && activeTrackIndex >= 0 ? queue[activeTrackIndex] : null;

      setTrackPlayerState({
        state: getStateLabel(state.state),
        queueLength: queue.length,
        currentTrackIndex: activeTrackIndex ?? null,
        currentTrack: currentTrack ?? null,
        position: progress.position,
        duration: progress.duration,
        buffered: progress.buffered,
        rate,
        volume,
      });
    } catch (error) {
      console.error("Failed to refresh TrackPlayer state:", error);
      setTrackPlayerState({
        state: "Error",
        queueLength: 0,
        currentTrackIndex: null,
        currentTrack: null,
        position: 0,
        duration: 0,
        buffered: 0,
        rate: 1.0,
        volume: 1.0,
      });
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
      const metadataDbFile = new File(sqliteDirectory, "abs2.sqlite");
      const logDbFile = new File(sqliteDirectory, "logs.sqlite");
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
            .filter((id): id is string => typeof id === "string" && id.length > 0)
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

      const ensureLibraryItemTitle = (
        libraryItemId: string,
        fallbackTitle?: string | null
      ): string => {
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
                typeof libraryItemId === "string" &&
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
      const libraryFileInfoMap = new Map(
        libraryFileInfos.map((info) => [info.id, info.libraryItemId])
      );

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
          id: "metadata-db",
          title: translate("advanced.storage.metadataDb"),
          count: metadataStats.count,
          size: metadataStats.size,
        },
        {
          id: "log-db",
          title: translate("advanced.storage.logDb"),
          count: logStats.count,
          size: logStats.size,
        },
        {
          id: "cover-cache",
          title: translate("advanced.storage.coverCache"),
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

      // Calculate total storage
      const totalSize =
        entries.reduce((sum, entry) => sum + entry.size, 0) +
        downloadEntries.reduce((sum, entry) => sum + entry.size, 0);
      const totalCount =
        entries.reduce((sum, entry) => sum + entry.count, 0) +
        downloadEntries.reduce((sum, entry) => sum + entry.count, 0);

      // Add total entry at the beginning
      const totalEntry: StorageEntry = {
        id: "total",
        title: translate("advanced.storage.totalUsed"),
        count: totalCount,
        size: totalSize,
      };

      entries.unshift(totalEntry);

      const allEntries = [...entries, ...downloadEntries];
      setStorageEntries(allEntries);

      // Update storage stats in the store
      updateStorageStatsInStore(allEntries);
    } catch (error) {
      console.error("Failed to refresh storage stats:", error);
      setStorageEntries([]);
    }
  }, [updateStorageStatsInStore]);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([refreshCounts(), refreshStorageStats(), refreshTrackPlayerState()]);
  }, [refreshCounts, refreshStorageStats, refreshTrackPlayerState]);

  const clearCoverCache = useCallback(async () => {
    try {
      await clearAllCoverCache();
      await clearAllLocalCovers();
      console.log("Cover cache and database imageUrls cleared successfully");
    } catch (error) {
      console.error("Failed to clear cover cache:", error);
    }
    await refreshStorageStats();
  }, [refreshStorageStats]);

  useEffect(() => {
    void refreshCounts();
    void refreshStorageStats();
    void refreshTrackPlayerState();
  }, [refreshCounts, refreshStorageStats, refreshTrackPlayerState]);

  const sections = useMemo<Section[]>(() => {
    const librarySection: Section = {
      title: translate("advanced.sections.libraryStats"),
      data: [
        {
          label: translate("advanced.stats.librariesFound", { count: libraries.length }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.selectedLibrary", {
            name: selectedLibrary?.name ?? translate("advanced.stats.selectedLibraryNone"),
          }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.authors", { count: counts.authors }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.genres", { count: counts.genres }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.languages", { count: counts.languages }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.narrators", { count: counts.narrators }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.series", { count: counts.series }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.tags", { count: counts.tags }),
          onPress: disabledOnPress,
          disabled: true,
        },
      ],
    };

    const storageSection: Section = {
      title: translate("advanced.sections.storage"),
      data: [
        {
          label: "storage-header",
          onPress: disabledOnPress,
          disabled: true,
          columns: [
            translate("advanced.storage.tableHeaders.item"),
            translate("advanced.storage.tableHeaders.files"),
            translate("advanced.storage.tableHeaders.size"),
          ],
          isHeader: true,
        },
        ...storageEntries.map((entry) => ({
          label: entry.id,
          onPress: disabledOnPress,
          disabled: true,
          columns: [entry.title, formatFileCount(entry.count), formatBytes(entry.size)] as [
            string,
            string,
            string,
          ],
        })),
      ],
    };

    const hasTrack = trackPlayerState.currentTrack !== null;
    const trackPlayerSection: Section = {
      title: translate("advanced.sections.trackPlayer"),
      data: [
        {
          label: translate("advanced.trackPlayer.state", { state: trackPlayerState.state }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.trackPlayer.queueLength", {
            length: trackPlayerState.queueLength,
          }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label:
            translate("advanced.trackPlayer.currentTrack") +
            (trackPlayerState.currentTrackIndex !== null
              ? translate("advanced.trackPlayer.trackIndex", {
                  index: trackPlayerState.currentTrackIndex,
                })
              : translate("advanced.trackPlayer.trackNone")),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label:
            translate("advanced.trackPlayer.track") +
            (trackPlayerState.currentTrack?.title ?? translate("advanced.trackPlayer.trackNone")) +
            (hasTrack
              ? ` (${trackPlayerState.currentTrack?.id ?? translate("advanced.trackPlayer.trackNone")})`
              : ""),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label:
            translate("advanced.trackPlayer.position") +
            `${formatDuration(trackPlayerState.position)} / ${formatDuration(trackPlayerState.duration)} (${formatDuration(trackPlayerState.buffered)}${translate("advanced.trackPlayer.buffered")})`,
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.trackPlayer.playbackRate", {
            rate: trackPlayerState.rate.toFixed(2),
          }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.trackPlayer.volume", {
            volume: (trackPlayerState.volume * 100).toFixed(0),
          }),
          onPress: disabledOnPress,
          disabled: true,
        },
      ],
    };

    const actionsSection: Section = {
      title: translate("advanced.sections.actions"),
      data: [
        {
          label: translate("advanced.actions.copyAccessToken"),
          onPress: async () => {
            if (accessToken) {
              await Clipboard.setStringAsync(accessToken);
            }
          },
          disabled: !accessToken,
        },
        {
          label: translate("advanced.actions.refreshLibraries"),
          onPress: refresh,
          disabled: false,
        },
        {
          label: translate("advanced.actions.refreshStats"),
          onPress: handleRefreshAll,
          disabled: false,
        },
        {
          label: translate("advanced.actions.clearCoverCache"),
          onPress: clearCoverCache,
          disabled: false,
        },
        {
          label: translate("advanced.actions.resetApp"),
          onPress: async () => {
            resetDatabase();
            await clearCoverCache();
            await logout();
          },
          disabled: false,
        },
      ],
    };

    return [librarySection, storageSection, trackPlayerSection, actionsSection];
  }, [
    libraries,
    selectedLibrary,
    counts,
    storageEntries,
    trackPlayerState,
    accessToken,
    refresh,
    handleRefreshAll,
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
            <Text style={{ ...styles.text, fontWeight: "bold", fontSize: 18 }}>{title}</Text>
          </View>
        )}
        renderItem={({ item }: { item: ActionItem }) => {
          if (item.columns) {
            return (
              <View
                style={[
                  styles.listItem,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  },
                ]}
              >
                <Text style={[styles.text, { flex: 1 }, item.isHeader && { fontWeight: "600" }]}>
                  {item.columns[0]}
                </Text>
                <Text
                  style={[
                    styles.text,
                    { width: 90, textAlign: "right" },
                    item.isHeader && { fontWeight: "600" },
                  ]}
                >
                  {item.columns[1]}
                </Text>
                <Text
                  style={[
                    styles.text,
                    { width: 110, textAlign: "right" },
                    item.isHeader && { fontWeight: "600" },
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
        contentContainerStyle={[styles.flatListContainer, floatingPlayerPadding]}
        indicatorStyle={isDark ? "white" : "black"}
        stickySectionHeadersEnabled={false}
      />
      <Stack.Screen options={{ title: translate("advanced.title") }} />
    </>
  );
}
