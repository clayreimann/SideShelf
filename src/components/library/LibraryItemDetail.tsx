import AudioFilesSection from "@/components/library/LibraryItemDetail/AudioFilesSection";
import BookmarksSection from "@/components/library/LibraryItemDetail/BookmarksSection";
import ChapterList from "@/components/library/LibraryItemDetail/ChapterList";
import ConsolidatedPlayerControls from "@/components/library/LibraryItemDetail/ConsolidatedPlayerControls";
import CoverSection from "@/components/library/LibraryItemDetail/CoverSection";
import DescriptionSection from "@/components/library/LibraryItemDetail/DescriptionSection";
import DownloadProgressView from "@/components/library/LibraryItemDetail/DownloadProgressView";
import GenresTagsSection from "@/components/library/LibraryItemDetail/GenresTagsSection";
import MetadataSection from "@/components/library/LibraryItemDetail/MetadataSection";
import ProgressSection from "@/components/library/LibraryItemDetail/ProgressSection";
import TitleSection from "@/components/library/LibraryItemDetail/TitleSection";
import { getMediaProgressForLibraryItem, upsertMediaProgress } from "@/db/helpers/mediaProgress";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { updateMediaProgress } from "@/lib/api/endpoints";
import { ASYNC_KEYS, saveItem } from "@/lib/asyncStore";
import { getCoverUri } from "@/lib/covers";
import { spacing } from "@/lib/styles";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { downloadService } from "@/services/DownloadService";
import { playerService } from "@/services/PlayerService";
import { progressService } from "@/services/ProgressService";
import {
  useDownloads,
  useLibraryItemDetails,
  useNetwork,
  usePlayer,
  useUserProfile,
} from "@/stores";
import { Ionicons } from "@expo/vector-icons";
import { MenuView } from "@react-native-menu/menu";
import { Stack } from "expo-router";
import React, { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";

interface LibraryItemDetailProps {
  itemId: string;
  onTitleChange?: (title: string) => void;
}

export default function LibraryItemDetail({ itemId, onTitleChange }: LibraryItemDetailProps) {
  const { styles, colors } = useThemedStyles();
  const { username, userId } = useAuth();
  const { currentTrack, position } = usePlayer();
  const { serverReachable } = useNetwork();
  const floatingPlayerPadding = useFloatingPlayerPadding();

  // Get store hooks
  const {
    fetchItemDetails,
    getCachedItem,
    updateItemProgress,
    loading: itemLoading,
  } = useLibraryItemDetails();
  const {
    activeDownloads,
    isItemDownloaded,
    isItemPartiallyDownloaded,
    startDownload,
    deleteDownload,
  } = useDownloads();
  const { getItemBookmarks, deleteBookmark } = useUserProfile();

  // Get cached item data or null
  const cachedData = getCachedItem(itemId);

  // Derive all data from cached data
  const item = cachedData?.item || null;
  const metadata = cachedData?.metadata || null;
  const genres = cachedData?.genres || [];
  const tags = cachedData?.tags || [];
  const chapters = cachedData?.chapters || [];
  const audioFiles = cachedData?.audioFiles || [];
  const progress = cachedData?.progress || null;

  // Check if item is currently loading
  const loading = itemLoading[itemId] === true && !cachedData;

  // Download state from store
  const downloadProgress = activeDownloads[itemId] || null;
  const isDownloading = !!downloadProgress;
  const isDownloaded = isItemDownloaded(itemId);
  const isPartiallyDownloaded = isItemPartiallyDownloaded(itemId);

  // Get bookmarks for this item
  const itemBookmarks = useMemo(() => {
    return getItemBookmarks(itemId);
  }, [itemId, getItemBookmarks]);

  // Fetch item details from store
  useEffect(() => {
    const loadItemDetails = async () => {
      if (!itemId) return;

      try {
        // Repair download status if needed (fixes iOS container path changes)
        // This runs silently in the background and logs any repairs made
        downloadService.repairDownloadStatus(itemId).catch((error) => {
          console.error("[LibraryItemDetail] Download status repair failed:", error);
        });

        // Fetch item details (uses cache if available)
        // userId comes from useAuth() — no DB round-trip needed here
        await fetchItemDetails(itemId, userId ?? undefined);

        // Notify parent of title change for header
        const currentData = getCachedItem(itemId);
        if (currentData?.metadata) {
          const title = currentData.metadata.title || translate("libraryItem.unknownTitle");
          onTitleChange?.(title);
        }
      } catch (error) {
        console.error("[LibraryItemDetail] Error fetching item details:", error);
        onTitleChange?.(translate("libraryItem.itemNotFound"));
      }
    };

    loadItemDetails();
  }, [itemId, userId, fetchItemDetails, getCachedItem, onTitleChange]);

  // Update title when metadata changes
  useEffect(() => {
    if (metadata) {
      const title = metadata.title || translate("libraryItem.unknownTitle");
      onTitleChange?.(title);
    }
  }, [metadata, onTitleChange]);

  // Derive authorId and seriesId from cached slice data — no separate DB fetch needed
  const authorId = cachedData?.authorId ?? null;
  const seriesId = cachedData?.seriesId ?? null;

  // Compute effective progress: use live player position if this item is playing,
  // otherwise use stored progress
  // Only show progress if there's actual progress (currentTime > 0 or progress > 0) OR if it's finished
  const effectiveProgress = useMemo(() => {
    if (!progress || !item) return null;

    // Check if this item is currently playing
    const isThisItemPlaying = currentTrack?.libraryItemId === item.id;

    let computedProgress = progress;
    if (isThisItemPlaying && position !== undefined) {
      // Use live position from player store (updated every second by background service)
      computedProgress = {
        ...progress,
        currentTime: position,
        progress: progress.duration ? position / progress.duration : 0,
      };
    }

    // Only show progress if:
    // 1. Item is finished, OR
    // 2. There's actual progress (currentTime > 0 or progress > 0)
    const hasProgress =
      (computedProgress.currentTime && computedProgress.currentTime > 0) ||
      (computedProgress.progress && computedProgress.progress > 0);

    if (computedProgress.isFinished || hasProgress) {
      return computedProgress;
    }

    return null;
  }, [progress, item?.id, currentTrack?.libraryItemId, position]);

  const handleToggleFinished = useCallback(async () => {
    if (!item || !userId || !effectiveProgress) return;

    try {
      const newIsFinished = !effectiveProgress.isFinished;
      const now = new Date();

      // Update progress in database
      const updatedProgress = {
        id: effectiveProgress.id || `${userId}-${item.id}`,
        userId,
        libraryItemId: item.id,
        episodeId: effectiveProgress.episodeId || null,
        duration: effectiveProgress.duration || null,
        progress: newIsFinished ? 1.0 : 0,
        currentTime: newIsFinished ? effectiveProgress.currentTime || null : 0,
        isFinished: newIsFinished,
        hideFromContinueListening: effectiveProgress.hideFromContinueListening || null,
        lastUpdate: now,
        startedAt: effectiveProgress.startedAt || now,
        finishedAt: newIsFinished ? now : null,
      };

      await upsertMediaProgress([updatedProgress]);

      // Clear cached position when marking as unfinished so next load starts from 0
      if (!newIsFinished) {
        await saveItem(ASYNC_KEYS.position, null);
      }

      // Update via API
      try {
        await updateMediaProgress(
          item.id,
          updatedProgress.currentTime || 0,
          updatedProgress.duration || 0,
          updatedProgress.progress || 0,
          newIsFinished
        );
      } catch (apiError) {
        console.error("[LibraryItemDetail] Failed to update progress on server:", apiError);
        // Continue even if API update fails - local update succeeded
      }

      // Refresh progress in store
      const refreshedProgress = await getMediaProgressForLibraryItem(item.id, userId);
      if (refreshedProgress) {
        updateItemProgress(itemId, refreshedProgress);
      }

      // Refresh server progress to sync
      await progressService.fetchServerProgress();
    } catch (error) {
      console.error("[LibraryItemDetail] Failed to toggle finished status:", error);
      Alert.alert(translate("common.error"), translate("libraryItem.alerts.finishedStatusFailed"));
    }
  }, [item, userId, effectiveProgress, itemId, updateItemProgress]);

  // Background enhancement is handled by the store automatically
  // Download subscriptions are handled by the store automatically

  // Download handlers - use store actions
  const handleDownload = useCallback(async () => {
    console.log("[LibraryItemDetail] Download button clicked", {
      hasItem: !!item,
      itemId: item?.id,
      isDownloading,
    });

    if (!item) {
      console.warn("[LibraryItemDetail] Cannot download: no item");
      return;
    }

    if (isDownloading) {
      console.warn("[LibraryItemDetail] Cannot download: download already in progress");
      return;
    }

    console.log("[LibraryItemDetail] Starting download for item:", item.id);

    try {
      await startDownload(item.id);
      console.log("[LibraryItemDetail] Download started successfully");
    } catch (error) {
      console.error("[LibraryItemDetail] Download failed:", error);
      Alert.alert(
        translate("common.error"),
        translate("libraryItem.alerts.downloadFailed", { error: String(error) }),
        [{ text: translate("common.ok") }]
      );
    }
  }, [item, isDownloading, startDownload]);

  const handleDeleteDownload = useCallback(async () => {
    if (!item) return;

    Alert.alert(
      translate("libraryItem.alerts.deleteDownload.title"),
      translate("libraryItem.alerts.deleteDownload.message"),
      [
        { text: translate("common.cancel"), style: "cancel" },
        {
          text: translate("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDownload(item.id);
            } catch (error) {
              console.error("[LibraryItemDetail] Delete download failed:", error);
              Alert.alert(
                translate("common.error"),
                translate("libraryItem.alerts.deleteFailed", { error: String(error) }),
                [{ text: translate("common.ok") }]
              );
            }
          },
        },
      ]
    );
  }, [item, deleteDownload]);

  const handleCancelDownload = useCallback(() => {
    if (!item) return;

    downloadService.cancelDownload(item.id);
    // State will be updated via progress subscription
  }, [item]);

  const handlePartialDownloadAction = useCallback(() => {
    if (!item) return;

    Alert.alert("Partially Downloaded", "Some files are missing from this item.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Re-download missing files",
        onPress: async () => {
          try {
            await startDownload(item.id);
          } catch (error) {
            console.error("[LibraryItemDetail] Re-download failed:", error);
            Alert.alert(
              translate("common.error"),
              translate("libraryItem.alerts.downloadFailed", { error: String(error) }),
              [{ text: translate("common.ok") }]
            );
          }
        },
      },
      {
        text: "Clear downloaded files",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDownload(item.id);
          } catch (error) {
            console.error("[LibraryItemDetail] Clear download failed:", error);
            Alert.alert(
              translate("common.error"),
              translate("libraryItem.alerts.deleteFailed", { error: String(error) }),
              [{ text: translate("common.ok") }]
            );
          }
        },
      },
    ]);
  }, [item, startDownload, deleteDownload]);

  const handlePauseDownload = useCallback(() => {
    if (!item) return;

    downloadService.pauseDownload(item.id);
    // State will be updated via progress subscription
  }, [item]);

  const handleResumeDownload = useCallback(() => {
    if (!item) return;

    downloadService.resumeDownload(item.id);
    // State will be updated via progress subscription
  }, [item]);

  // Force resync position handler
  const handleForceResync = useCallback(async () => {
    if (!item || !userId) return;

    try {
      // Force resync position from server
      await progressService.forceResyncPosition(userId, item.id);

      // Refresh item details to show updated progress
      await fetchItemDetails(item.id);

      // If this is the currently playing item, update the player position
      if (currentTrack?.libraryItemId === item.id) {
        await playerService.syncPositionFromDatabase();
      }

      Alert.alert(translate("common.success"), "Position synced from server successfully", [
        { text: translate("common.ok") },
      ]);
    } catch (error) {
      console.error("[LibraryItemDetail] Force resync failed:", error);
      Alert.alert(translate("common.error"), `Failed to resync position: ${String(error)}`, [
        { text: translate("common.ok") },
      ]);
    }
  }, [item, userId, currentTrack, fetchItemDetails]);

  // Menu handler
  const handleMenuAction = useCallback(
    (actionId: string) => {
      switch (actionId) {
        case "download":
          handleDownload();
          break;
        case "delete":
          handleDeleteDownload();
          break;
        case "partial":
          handlePartialDownloadAction();
          break;
        case "mark-finished":
          handleToggleFinished();
          break;
        case "force-resync":
          handleForceResync();
          break;
        default:
          break;
      }
    },
    [
      handleDownload,
      handleDeleteDownload,
      handlePartialDownloadAction,
      handleToggleFinished,
      handleForceResync,
    ]
  );

  // Build menu actions based on current state
  const menuActions = useMemo(() => {
    const actions = [];

    // Download/Delete action
    if (isDownloaded) {
      actions.push({
        id: "delete",
        title: translate("libraryItem.actions.deleteDownload"),
        attributes: { destructive: true },
        image: "trash",
        imageColor: "#FF3B30",
      });
    } else if (isPartiallyDownloaded && !isDownloading) {
      // Show partial action for items with some files downloaded
      actions.push({
        id: "partial",
        title: "Partial Download",
        image: "arrow.down.circle.dotted",
      });
    } else if (!isDownloading && serverReachable !== false) {
      // Only show download option when server is reachable
      actions.push({
        id: "download",
        title: translate("libraryItem.actions.download"),
        image: "arrow.down.circle",
      });
    }

    // Mark as Finished/Unfinished action
    if (effectiveProgress) {
      if (effectiveProgress.isFinished) {
        actions.push({
          id: "mark-finished",
          title: translate("libraryItem.actions.markUnfinished"),
          image: "arrow.uturn.backward.circle",
        });
      } else {
        actions.push({
          id: "mark-finished",
          title: translate("libraryItem.actions.markFinished"),
          image: "checkmark.circle",
        });
      }
    }

    // Force Resync Position action (only show if this item is currently playing or has progress)
    if (effectiveProgress || currentTrack?.libraryItemId === itemId) {
      actions.push({
        id: "force-resync",
        title: "Force Resync Position",
        image: "arrow.clockwise.circle",
      });
    }

    return actions;
  }, [
    isDownloaded,
    isPartiallyDownloaded,
    isDownloading,
    effectiveProgress,
    currentTrack,
    itemId,
    serverReachable,
  ]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>{translate("libraryItem.itemNotFound")}</Text>
      </View>
    );
  }

  // Prefer metadata fields, fallback to item fields
  const title = metadata?.title || translate("libraryItem.unknownTitle");
  const coverUri = metadata?.imageUrl || (item ? getCoverUri(item.id) : null);
  const description = metadata?.description || "";
  const author = metadata?.authorName || metadata?.author || translate("libraryItem.unknownAuthor");
  const narrator = metadata?.narratorName || null;
  const series = metadata?.seriesName || null;

  // Calculate cover size - approximately 60% of screen width
  // We'll use a fixed reasonable size since we don't have useWindowDimensions anymore
  const imageSize = 240; // Reasonable size for most screens

  return (
    <>
      <ScrollView
        style={[componentStyles.scrollView, { backgroundColor: styles.container.backgroundColor }]}
        contentContainerStyle={[componentStyles.scrollViewContent, floatingPlayerPadding]}
      >
        {/* Cover Image */}
        <CoverSection coverUri={coverUri} title={title} imageSize={imageSize} />

        {/* Title */}
        <TitleSection title={title} />

        {/* Author, Narrator, Series, Duration, Year, Download Status */}
        <MetadataSection
          author={author}
          narrator={narrator}
          series={series}
          duration={metadata?.duration}
          publishedYear={metadata?.publishedYear}
          isDownloaded={isDownloaded}
          authorId={authorId}
          seriesId={seriesId}
        />

        {/* Download Section */}
        {isDownloading && (
          <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
            <DownloadProgressView
              downloadProgress={downloadProgress}
              onPause={handlePauseDownload}
              onResume={handleResumeDownload}
              onCancel={handleCancelDownload}
            />
          </View>
        )}

        {/* Consolidated Player Controls (replaces simple Play button) */}
        {audioFiles.length > 0 && (
          <ConsolidatedPlayerControls
            libraryItemId={itemId}
            isDownloaded={isDownloaded}
            serverReachable={serverReachable ?? false}
          />
        )}

        {/* Progress display */}
        {effectiveProgress && <ProgressSection progress={effectiveProgress} />}

        {/* Genres and Tags */}
        <GenresTagsSection genres={genres} tags={tags} />

        {/* Description */}
        <DescriptionSection description={description} />

        {/* Chapters */}
        <ChapterList
          chapters={chapters.map((ch) => ({
            id: ch.chapterId,
            start: ch.start,
            end: ch.end,
            title: ch.title,
          }))}
          currentPosition={currentTrack?.libraryItemId === itemId ? position : 0}
          libraryItemId={itemId}
          isCurrentlyPlaying={currentTrack?.libraryItemId === itemId}
        />

        {/* Bookmarks */}
        <BookmarksSection
          bookmarks={itemBookmarks}
          libraryItemId={itemId}
          isCurrentlyPlaying={currentTrack?.libraryItemId === itemId}
          onDeleteBookmark={deleteBookmark}
        />

        {/* Audio Files */}
        <AudioFilesSection audioFiles={audioFiles} />
      </ScrollView>

      <Stack.Screen
        options={{
          headerRight: () => (
            <MenuView
              title="Options"
              onPressAction={({ nativeEvent }) => {
                handleMenuAction(nativeEvent.event);
              }}
              actions={menuActions}
            >
              <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
              </View>
            </MenuView>
          ),
        }}
      />
    </>
  );
}

const componentStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: spacing.lg,
  },
  sectionContainer: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  coverContainer: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
});
