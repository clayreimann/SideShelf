import { AuthorIcon, DownloadButton, NarratorIcon, SeriesIcon } from "@/components/icons";
import ChapterList from "@/components/library/LibraryItemDetail/ChapterList";
import DownloadProgressView from "@/components/library/LibraryItemDetail/DownloadProgressView";
import { CollapsibleSection, ProgressBar } from "@/components/ui";
import { getMediaAuthors, getMediaSeries } from "@/db/helpers/mediaJoins";
import { getMediaProgressForLibraryItem, upsertMediaProgress } from "@/db/helpers/mediaProgress";
import { getUserByUsername } from "@/db/helpers/users";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { updateMediaProgress } from "@/lib/api/endpoints";
import { getCoverUri } from "@/lib/covers";
import { navigateToAuthor, navigateToSeries } from "@/lib/navigation";
import { spacing } from "@/lib/styles";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { downloadService } from "@/services/DownloadService";
import { playerService } from "@/services/PlayerService";
import { progressService } from "@/services/ProgressService";
import { useDownloads, useLibraryItemDetails, usePlayer } from "@/stores";
import { MenuView } from "@react-native-menu/menu";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import RenderHtml from "react-native-render-html";
import CoverImage from "../ui/CoverImange";

interface LibraryItemDetailProps {
  itemId: string;
  onTitleChange?: (title: string) => void;
}

// Helper function to format time in seconds to HH:MM:SS
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}

// Helper function to format duration in seconds to readable format (e.g., "12h 30m")
function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  }
  return "";
}

function Separator() {
  const { isDark } = useThemedStyles();
  return (
    <View style={{ marginHorizontal: 12 }}>
      <Text
        style={{
          color: isDark ? "#bbb" : "#444",
          fontSize: 24,
          textAlign: "center",
        }}
      >
        •
      </Text>
    </View>
  );
}

const HTMLTagsStyles = {
  p: { marginBottom: 12, lineHeight: 24 },
  div: { marginBottom: 8 },
  br: { marginBottom: 8 },
  b: { fontWeight: "bold" as const },
  strong: { fontWeight: "bold" as const },
  i: { fontStyle: "italic" as const },
};

export default function LibraryItemDetail({ itemId, onTitleChange }: LibraryItemDetailProps) {
  const { styles, colors, isDark } = useThemedStyles();
  const { width } = useWindowDimensions();
  const { username, serverUrl, accessToken } = useAuth();
  const { currentTrack, position, isPlaying, isLoadingTrack } = usePlayer();
  const floatingPlayerPadding = useFloatingPlayerPadding();
  const router = useRouter();

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

  const htmlSource = useMemo(() => ({ html: metadata?.description ?? "" }), [metadata]);
  const baseStyle = useMemo(() => ({ color: colors.textPrimary, fontSize: 16 }), [colors]);

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

  // Play handler
  const handlePlay = useCallback(async () => {
    if (!item) {
      Alert.alert(
        translate("libraryItem.alerts.cannotPlay"),
        translate("libraryItem.alerts.itemNotFound")
      );
      return;
    }

    try {
      // Check if this item is currently playing
      const isThisItemPlaying = currentTrack?.libraryItemId === item.id;

      if (isThisItemPlaying) {
        // Toggle play/pause for currently playing item
        await playerService.togglePlayPause();
      } else {
        // Play a different item
        await playerService.playTrack(item.id);
      }
    } catch (error) {
      console.error("[LibraryItemDetail] Failed to play track:", error);
      Alert.alert(
        translate("common.error"),
        translate("libraryItem.alerts.playbackFailed", { error: String(error) }),
        [{ text: translate("common.ok") }]
      );
    }
  }, [item, currentTrack]);

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
        default:
          break;
      }
    },
    [handleDownload, handleDeleteDownload, handleToggleFinished]
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
    } else if (!isDownloading) {
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

    return actions;
  }, [isDownloaded, isDownloading, effectiveProgress]);

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
  const imageSize = width * 0.6;

  return (
    <>
      <ScrollView
        style={[componentStyles.scrollView, { backgroundColor: styles.container.backgroundColor }]}
        contentContainerStyle={[componentStyles.scrollViewContent, floatingPlayerPadding]}
      >
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <View
            style={{
              height: imageSize,
              width: imageSize,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <CoverImage uri={coverUri} title={title} fontSize={14} />
          </View>
        </View>
        <Text
          style={[
            styles.text,
            {
              fontSize: 24,
              fontWeight: "bold",
              marginBottom: 8,
              textAlign: "center",
            },
          ]}
        >
          {title}
        </Text>
        {/* Author, Narrator, Series */}
        <View
          style={{
            flexDirection: "column",
            width: "100%",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              width: "100%",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexShrink: 1,
              }}
              onPress={() => {
                if (authorId) {
                  navigateToAuthor(router, authorId);
                }
              }}
              disabled={!authorId}
            >
              <AuthorIcon style={{ marginRight: 8 }} />
              <Text
                style={[
                  styles.text,
                  {
                    textAlign: "center",
                    flexShrink: 1,
                    textDecorationLine: authorId ? "underline" : "none",
                  },
                ]}
              >
                {author}
              </Text>
            </TouchableOpacity>
            {narrator ? (
              <>
                <Separator />
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flexShrink: 1,
                  }}
                >
                  <NarratorIcon style={{ marginRight: 8 }} />
                  <Text style={[styles.text, { textAlign: "center", flexShrink: 1 }]}>
                    {narrator}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
          {series ? (
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => {
                if (seriesId) {
                  navigateToSeries(router, seriesId);
                }
              }}
              disabled={!seriesId}
            >
              <SeriesIcon />
              <Text
                style={[
                  styles.text,
                  {
                    fontStyle: "italic",
                    marginBottom: 4,
                    marginLeft: 4,
                    textAlign: "center",
                    textDecorationLine: seriesId ? "underline" : "none",
                  },
                ]}
              >
                {series}
              </Text>
            </TouchableOpacity>
          ) : null}
          {/* Duration, Year, and Download Status */}
          {(metadata?.duration || metadata?.publishedYear || isDownloaded) && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 4,
                flexWrap: "wrap",
              }}
            >
              {metadata?.duration && (
                <Text style={[styles.text, { fontSize: 14, opacity: 0.7 }]}>
                  {formatDuration(metadata.duration)}
                </Text>
              )}
              {metadata?.publishedYear && (
                <>
                  {metadata?.duration && <Separator />}
                  <Text style={[styles.text, { fontSize: 14, opacity: 0.7 }]}>
                    {metadata.publishedYear}
                  </Text>
                </>
              )}
              {isDownloaded && (
                <>
                  {(metadata?.duration || metadata?.publishedYear) && <Separator />}
                  <Text style={[styles.text, { fontSize: 14, color: "#34C759" }]}>
                    {translate("libraryItem.downloaded")}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* Progress display */}
        {effectiveProgress && (
          <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
            <View
              style={{
                backgroundColor: isDark ? "#333" : "#f5f5f5",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <ProgressBar
                progress={effectiveProgress.progress || 0}
                variant="medium"
                showTimeLabels={!!(effectiveProgress.currentTime && effectiveProgress.duration)}
                currentTime={effectiveProgress.currentTime || undefined}
                duration={effectiveProgress.duration || undefined}
                showPercentage={true}
              />
            </View>
          </View>
        )}

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

        {/* Play Button */}
        {audioFiles.length > 0 && (
          <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
            <TouchableOpacity
              style={{
                backgroundColor: "#34C759",
                borderRadius: 8,
                padding: 12,
                alignItems: "center",
                opacity: isLoadingTrack ? 0.5 : 1,
              }}
              onPress={handlePlay}
              disabled={isLoadingTrack}
            >
              <Text
                style={{
                  color: "white",
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                {isLoadingTrack
                  ? translate("common.loading")
                  : currentTrack?.libraryItemId === item?.id && isPlaying
                    ? translate("common.pause")
                    : translate("common.play")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {genres && genres.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginBottom: 8,
              justifyContent: "center",
            }}
          >
            {genres.map((g: string, idx: number) => (
              <View
                key={g + idx}
                style={{
                  backgroundColor: isDark ? "#333" : "#eee",
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  margin: 2,
                }}
              >
                <Text style={{ fontSize: 12, color: isDark ? "#ccc" : "#333" }}>{g}</Text>
              </View>
            ))}
          </View>
        )}
        {tags && tags.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginBottom: 8,
              justifyContent: "center",
            }}
          >
            {tags.map((t: string, idx: number) => (
              <View
                key={t + idx}
                style={{
                  backgroundColor: isDark ? "#1a4f6e" : "#d0eaff",
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  margin: 2,
                }}
              >
                <Text style={{ fontSize: 12, color: isDark ? "#ccc" : "#333" }}>{t}</Text>
              </View>
            ))}
          </View>
        )}
        {/* Collapsible Description */}
        {description && (
          <CollapsibleSection title={translate("libraryItem.description")} defaultExpanded={true}>
            <RenderHtml
              contentWidth={width - 64}
              source={htmlSource}
              baseStyle={baseStyle}
              tagsStyles={HTMLTagsStyles}
            />
          </CollapsibleSection>
        )}

        {/* Collapsible Chapters */}
        <ChapterList
          chapters={chapters}
          currentPosition={currentTrack?.libraryItemId === itemId ? position : 0}
          libraryItemId={itemId}
          isCurrentlyPlaying={currentTrack?.libraryItemId === itemId && isPlaying}
        />

        {/* Collapsible Audio Files */}
        {audioFiles.length > 0 && (
          <CollapsibleSection title={translate("libraryItem.audioFiles", { count: audioFiles.length })}>
            {audioFiles.map((file, index) => (
              <View
                key={file.id}
                style={{
                  paddingVertical: 8,
                  borderBottomWidth: index < audioFiles.length - 1 ? 1 : 0,
                  borderBottomColor: isDark ? "#444" : "#eee",
                }}
              >
                <Text
                  style={[styles.text, { fontWeight: "600", marginBottom: 2 }]}
                  numberOfLines={1}
                >
                  {file.filename}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                    Duration: {file.duration ? formatTime(file.duration) : "Unknown"}
                  </Text>
                  {file.size && (
                    <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                      Size: {(file.size / 1024 / 1024).toFixed(1)} MB
                    </Text>
                  )}
                  {file.downloadInfo?.isDownloaded && (
                    <Text style={[styles.text, { fontSize: 12, color: "#007AFF" }]}>
                      ⬇ Downloaded
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </CollapsibleSection>
        )}
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
