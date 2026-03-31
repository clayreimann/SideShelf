/**
 * Storage Screen
 *
 * Displays storage usage statistics including metadata database, logs,
 * cover cache, and downloaded files
 */

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
import { associateOrphanFile } from "@/lib/orphanAssociation";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { Ionicons } from "@expo/vector-icons";
import { clearAllCoverCache } from "@/lib/covers";
import { formatBytes } from "@/lib/helpers/formatters";
import {
  isExcludedFromBackup,
  isICloudBackupExclusionAvailable,
} from "@/lib/iCloudBackupExclusion";
import { useThemedStyles } from "@/lib/theme";
import { type StorageEntry, useStatistics } from "@/stores";
import { eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { Directory, File, Paths } from "expo-file-system";
import { OrphanFile, scanForOrphanFiles } from "@/lib/orphanScanner";
import { Stack, useFocusEffect } from "expo-router";
import { defaultDatabaseDirectory } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Alert, Pressable, SectionList, Text, View } from "react-native";

type Section = {
  title: string;
  data: ActionItem[];
};

type ActionItem = {
  label: string;
  sublabel?: string;
  onPress: () => void;
  disabled?: boolean;
  columns?: [string, string, string] | [string, string, string, string];
  isHeader?: boolean;
  isLegend?: boolean;
  legendItems?: string[];
  trashAction?: () => void;
  linkAction?: () => void;
};

type StorageBucketStats = {
  count: number;
  size: number;
};

type BackupExclusionStatus = {
  /** true = all excluded, false = none excluded, 'mixed' = some excluded */
  status: boolean | "mixed" | undefined;
  /** Number of files checked */
  checkedCount: number;
  /** Number of files that are excluded */
  excludedCount: number;
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
        console.warn("[Storage] Failed to inspect file:", error);
        return acc;
      }
    },
    { count: 0, size: 0 }
  );
}

/**
 * Check backup exclusion status for multiple file paths
 * Returns a summary of exclusion status across all files
 */
async function checkBackupExclusionForPaths(paths: string[]): Promise<BackupExclusionStatus> {
  if (!isICloudBackupExclusionAvailable()) {
    return { status: undefined, checkedCount: 0, excludedCount: 0 };
  }

  if (!paths || paths.length === 0) {
    return { status: undefined, checkedCount: 0, excludedCount: 0 };
  }

  let excludedCount = 0;
  let checkedCount = 0;

  // Check all files in parallel
  await Promise.all(
    paths.map(async (path) => {
      if (!path) {
        return;
      }

      try {
        const file = new File(path);
        if (!file.exists) {
          return;
        }

        const result = await isExcludedFromBackup(path);
        checkedCount++;
        if (result.excluded) {
          excludedCount++;
        }
      } catch (error) {
        console.warn("[Storage] Failed to check backup exclusion for:", path, error);
      }
    })
  );

  // Determine overall status
  if (checkedCount === 0) {
    return { status: undefined, checkedCount, excludedCount };
  }

  if (excludedCount === checkedCount) {
    return { status: true, checkedCount, excludedCount };
  }

  if (excludedCount === 0) {
    return { status: false, checkedCount, excludedCount };
  }

  return { status: "mixed", checkedCount, excludedCount };
}

function getSQLiteDirectory(): Directory {
  if (defaultDatabaseDirectory) {
    return new Directory(defaultDatabaseDirectory);
  }

  return new Directory(Paths.document, "SQLite");
}

function formatFileCount(count: number): string {
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

export default function StorageScreen() {
  const { styles, isDark } = useThemedStyles();
  const { refreshStorageStats: updateStorageStatsInStore } = useStatistics();
  const floatingPlayerPadding = useFloatingPlayerPadding();

  const [storageEntries, setStorageEntries] = useState<StorageEntry[]>([]);
  const [orphanFiles, setOrphanFiles] = useState<OrphanFile[]>([]);

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
            // Store all paths for backup exclusion checking
            paths: group.paths,
            excludedFromBackup: undefined as boolean | "mixed" | undefined,
          };
        })
        .filter((entry) => entry.count > 0)
        .sort((a, b) => a.title.localeCompare(b.title));

      // Check backup exclusion status for download entries (iOS only)
      if (isICloudBackupExclusionAvailable()) {
        await Promise.all(
          downloadEntries.map(async (entry) => {
            if (entry.paths && entry.paths.length > 0) {
              const backupStatus = await checkBackupExclusionForPaths(entry.paths);
              entry.excludedFromBackup = backupStatus.status;
            }
          })
        );
      }

      // Remove temporary paths property before adding to entries
      const downloadEntriesClean: StorageEntry[] = downloadEntries.map(
        ({ paths, ...entry }) => entry
      );

      // Calculate total storage
      const totalSize =
        entries.reduce((sum, entry) => sum + entry.size, 0) +
        downloadEntriesClean.reduce((sum, entry) => sum + entry.size, 0);
      const totalCount =
        entries.reduce((sum, entry) => sum + entry.count, 0) +
        downloadEntriesClean.reduce((sum, entry) => sum + entry.count, 0);

      // Add total entry at the beginning
      const totalEntry: StorageEntry = {
        id: "total",
        title: translate("advanced.storage.totalUsed"),
        count: totalCount,
        size: totalSize,
      };

      entries.unshift(totalEntry);

      const allEntries = [...entries, ...downloadEntriesClean];
      setStorageEntries(allEntries);

      // Update storage stats in the store
      updateStorageStatsInStore(allEntries);

      // Scan for orphan files (non-fatal)
      try {
        const orphans = await scanForOrphanFiles();
        setOrphanFiles(orphans);
      } catch (orphanError) {
        console.warn("[Storage] Orphan scan failed:", orphanError);
        // Non-fatal — storage stats still display
      }
    } catch (error) {
      console.error("Failed to refresh storage stats:", error);
      setStorageEntries([]);
    }
  }, [updateStorageStatsInStore]);

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

  useFocusEffect(
    useCallback(() => {
      void refreshStorageStats();
    }, [refreshStorageStats])
  );

  const deleteOrphanFile = useCallback(async (orphan: OrphanFile) => {
    try {
      const file = new File(orphan.uri);
      if (file.exists) {
        await file.delete();
      }
      setOrphanFiles((prev) => prev.filter((f) => f.uri !== orphan.uri));
    } catch (error) {
      console.error("[Storage] Failed to delete orphan file:", error);
    }
  }, []);

  const handleAssociateOrphan = useCallback(
    (orphan: OrphanFile) =>
      associateOrphanFile(orphan, (uri) =>
        setOrphanFiles((prev) => prev.filter((f) => f.uri !== uri))
      ),
    []
  );

  // Determine if we should show the backup column
  const showBackupColumn = isICloudBackupExclusionAvailable();

  const sections: Section[] = [
    {
      title: translate("advanced.sections.storage"),
      data: [
        {
          label: "storage-header",
          onPress: disabledOnPress,
          disabled: true,
          columns: showBackupColumn
            ? [
                translate("advanced.storage.tableHeaders.item"),
                translate("advanced.storage.tableHeaders.files"),
                translate("advanced.storage.tableHeaders.size"),
                translate("advanced.storage.tableHeaders.willBackup"),
              ]
            : [
                translate("advanced.storage.tableHeaders.item"),
                translate("advanced.storage.tableHeaders.files"),
                translate("advanced.storage.tableHeaders.size"),
              ],
          isHeader: true,
        },
        ...storageEntries.map((entry) => {
          const backupStatus =
            entry.excludedFromBackup === true
              ? "✗"
              : entry.excludedFromBackup === false
                ? "✓"
                : entry.excludedFromBackup === "mixed"
                  ? "⚠"
                  : "-";

          return {
            label: entry.id,
            onPress: disabledOnPress,
            disabled: true,
            columns: showBackupColumn
              ? ([
                  entry.title,
                  formatFileCount(entry.count),
                  formatBytes(entry.size),
                  backupStatus,
                ] as [string, string, string, string])
              : ([entry.title, formatFileCount(entry.count), formatBytes(entry.size)] as [
                  string,
                  string,
                  string,
                ]),
          };
        }),
        // Add legend footer if backup column is shown
        ...(showBackupColumn
          ? [
              {
                label: "backup-legend",
                onPress: disabledOnPress,
                disabled: true,
                isLegend: true,
                legendItems: [
                  translate("advanced.storage.legend.excluded"),
                  translate("advanced.storage.legend.notExcluded"),
                  translate("advanced.storage.legend.mixed"),
                  translate("advanced.storage.legend.unknown"),
                ],
              },
            ]
          : []),
      ],
    },
    {
      title: translate("advanced.sections.actions"),
      data: [
        {
          label: translate("advanced.actions.clearCoverCache"),
          onPress: clearCoverCache,
          disabled: false,
        },
        {
          label: translate("advanced.actions.refreshStats"),
          onPress: refreshStorageStats,
          disabled: false,
        },
      ],
    },
    ...(orphanFiles.length > 0
      ? [
          {
            title: "Unknown files",
            data: orphanFiles.map((orphan) => ({
              label: orphan.filename,
              sublabel: formatBytes(orphan.size),
              onPress: disabledOnPress,
              disabled: true,
              linkAction: () => void handleAssociateOrphan(orphan),
              trashAction: () => {
                Alert.alert(
                  "Delete Unknown File",
                  `Delete "${orphan.filename}" (${formatBytes(orphan.size)})?`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => void deleteOrphanFile(orphan),
                    },
                  ]
                );
              },
            })),
          },
        ]
      : []),
  ];

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
          if (item.isLegend && item.legendItems) {
            return (
              <View
                style={[
                  styles.listItem,
                  {
                    paddingVertical: 12,
                    backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)",
                  },
                ]}
              >
                {item.legendItems.map((legendItem, index) => (
                  <Text
                    key={index}
                    style={[
                      styles.text,
                      {
                        fontSize: 12,
                        opacity: 0.7,
                        marginBottom: index < item.legendItems!.length - 1 ? 4 : 0,
                      },
                    ]}
                  >
                    {legendItem}
                  </Text>
                ))}
              </View>
            );
          }

          if (item.columns) {
            const hasFourColumns = item.columns.length === 4;
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
                    { width: hasFourColumns ? 90 : 110, textAlign: "right" },
                    item.isHeader && { fontWeight: "600" },
                  ]}
                >
                  {item.columns[2]}
                </Text>
                {hasFourColumns && (
                  <Text
                    style={[
                      styles.text,
                      { width: 50, textAlign: "center" },
                      item.isHeader && { fontWeight: "600" },
                    ]}
                  >
                    {item.columns[3]}
                  </Text>
                )}
              </View>
            );
          }

          return (
            <View style={[styles.listItem, { flexDirection: "row", alignItems: "center" }]}>
              <View style={{ flex: 1 }}>
                <Text style={item.disabled ? styles.text : styles.link}>{item.label}</Text>
                {item.sublabel && (
                  <Text style={[styles.text, { fontSize: 12, opacity: 0.6 }]}>{item.sublabel}</Text>
                )}
              </View>
              {item.linkAction && (
                <Pressable
                  onPress={item.linkAction}
                  style={{ padding: 8 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="link-outline" size={20} color="#007AFF" />
                </Pressable>
              )}
              {item.trashAction && (
                <Pressable
                  onPress={item.trashAction}
                  style={{ padding: 8 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </Pressable>
              )}
            </View>
          );
        }}
        contentContainerStyle={[styles.flatListContainer, floatingPlayerPadding]}
        indicatorStyle={isDark ? "white" : "black"}
        stickySectionHeadersEnabled={false}
      />
      <Stack.Screen options={{ title: translate("storage.title") }} />
    </>
  );
}
