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
import { getMediaAuthors, getMediaSeries } from "@/db/helpers/mediaJoins";
import { getMediaProgressForLibraryItem, upsertMediaProgress } from "@/db/helpers/mediaProgress";
import { getUserByUsername } from "@/db/helpers/users";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { updateMediaProgress } from "@/lib/api/endpoints";
import { getCoverUri } from "@/lib/covers";
import { spacing } from "@/lib/styles";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { downloadService } from "@/services/DownloadService";
import { playerService } from "@/services/PlayerService";
import { progressService } from "@/services/ProgressService";
import { useDownloads, useLibraryItemDetails, useNetwork, usePlayer, useUserProfile } from "@/stores";
import { Ionicons } from "@expo/vector-icons";
import { MenuView } from "@react-native-menu/menu";
import { Stack } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";

interface LibraryItemDetailProps {
  itemId: string;
  onTitleChange?: (title: string) => void;
}

export default function LibraryItemDetail({ itemId, onTitleChange }: LibraryItemDetailProps) {
  const { styles, colors } = useThemedStyles();
  const { username, serverUrl, accessToken } = useAuth();
  const { currentTrack, position } = usePlayer();
  const { serverReachable } = useNetwork();
  const floatingPlayerPadding = useFloatingPlayerPadding();

  // State for author and series IDs
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [seriesId, setSeriesId] = useState<string | null>(null);

  // Get store hooks
  const {
    fetchItemDetails,
    getCachedItem,
    updateItemProgress,
    loading: itemLoading,
  } = useLibraryItemDetails();
  const { activeDownloads, isItemDownloaded, startDownload, deleteDownload } = useDownloads();
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

  // Get bookmarks for this item
  const itemBookmarks = useMemo(() => {
    return getItemBookmarks(itemId);
  }, [itemId, getItemBookmarks]);

  // Fetch item details from store
  useEffect(() => {
    const loadItemDetails = async () => {
      if (!itemId) return;

      try {
        // Get user ID for progress fetching
        const user = username ? await getUserByUsername(username) : null;
        const userId = user?.id;

        // Fetch item details (uses cache if available)
        await fetchItemDetails(itemId, userId);

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
  }, [itemId, username, fetchItemDetails, getCachedItem, onTitleChange]);

  // Update title when metadata changes
  useEffect(() => {
    if (metadata) {
      const title = metadata.title || translate("libraryItem.unknownTitle");
      onTitleChange?.(title);
    }
  }, [metadata, onTitleChange]);

  // Fetch author and series IDs for navigation
  useEffect(() => {
    const fetchRelationIds = async () => {
      if (!metadata?.id) {
        setAuthorId(null);
        setSeriesId(null);
        return;
      }

      try {
        // Fetch authors and series in parallel
        const [authors, series] = await Promise.all([
          getMediaAuthors(metadata.id),
          getMediaSeries(metadata.id),
        ]);

        // Use first author and series for navigation
        setAuthorId(authors[0]?.authorId || null);
        setSeriesId(series[0] || null);
      } catch (error) {
        console.error("[LibraryItemDetail] Error fetching author/series IDs:", error);
        setAuthorId(null);
        setSeriesId(null);
      }
    };

    fetchRelationIds();
  }, [metadata?.id]);

  // User progress fetching effect - update store with latest progress
  useEffect(() => {
    const fetchUserProgress = async () => {
      if (!username || !item) return;

      try {
        // Fetch latest progress from server
        await progressService.fetchServerProgress();

        // Get the local progress data
        const user = await getUserByUsername(username);
        if (user?.id) {
          const progressData = await getMediaProgressForLibraryItem(item.id, user.id);
          // Update progress in store (will trigger re-render via store subscription)
          if (progressData) {
            updateItemProgress(itemId, progressData);
          }
        }
      } catch (error) {
        console.error("[LibraryItemDetail] Error fetching user progress:", error);
      }
    };

    fetchUserProgress();
  }, [username, item?.id, itemId, updateItemProgress]);

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
    if (!item || !username || !effectiveProgress) return;

    try {
      const user = await getUserByUsername(username);
      if (!user?.id) {
        Alert.alert(translate("common.error"), translate("libraryItem.alerts.userNotFound"));
        return;
      }

      const newIsFinished = !effectiveProgress.isFinished;
      const now = new Date();

      // Update progress in database
      const updatedProgress = {
        id: effectiveProgress.id || `${user.id}-${item.id}`,
        userId: user.id,
        libraryItemId: item.id,
        episodeId: effectiveProgress.episodeId || null,
        duration: effectiveProgress.duration || null,
        progress: newIsFinished ? 1.0 : effectiveProgress.progress || 0,
        currentTime: effectiveProgress.currentTime || null,
        isFinished: newIsFinished,
        hideFromContinueListening: effectiveProgress.hideFromContinueListening || null,
        lastUpdate: now,
        startedAt: effectiveProgress.startedAt || now,
        finishedAt: newIsFinished ? now : null,
      };

      await upsertMediaProgress([updatedProgress]);

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
      const refreshedProgress = await getMediaProgressForLibraryItem(item.id, user.id);
      if (refreshedProgress) {
        updateItemProgress(itemId, refreshedProgress);
      }

      // Refresh server progress to sync
      await progressService.fetchServerProgress();
    } catch (error) {
      console.error("[LibraryItemDetail] Failed to toggle finished status:", error);
      Alert.alert(translate("common.error"), translate("libraryItem.alerts.finishedStatusFailed"));
    }
  }, [item, username, effectiveProgress, itemId, updateItemProgress]);

  // Background enhancement is handled by the store automatically
  // Download subscriptions are handled by the store automatically

  // Download handlers - use store actions
  const handleDownload = useCallback(async () => {
    if (!item || !serverUrl || !accessToken || isDownloading) return;

    try {
      await startDownload(item.id, serverUrl, accessToken);
    } catch (error) {
      console.error("[LibraryItemDetail] Download failed:", error);
      Alert.alert(
        translate("common.error"),
        translate("libraryItem.alerts.downloadFailed", { error: String(error) }),
        [{ text: translate("common.ok") }]
      );
    }
  }, [item, serverUrl, accessToken, isDownloading, startDownload]);

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
    if (!item || !username) return;

    try {
      // Get user ID from database
      const user = await getUserByUsername(username);
      if (!user?.id) {
        Alert.alert(translate("common.error"), "User not found", [
          { text: translate("common.ok") },
        ]);
        return;
      }

      // Force resync position from server
      await progressService.forceResyncPosition(user.id, item.id);

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
  }, [item, username, currentTrack, fetchItemDetails]);

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
    [handleDownload, handleDeleteDownload, handleToggleFinished, handleForceResync]
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
  }, [isDownloaded, isDownloading, effectiveProgress, currentTrack, itemId, serverReachable]);

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
          chapters={chapters}
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
