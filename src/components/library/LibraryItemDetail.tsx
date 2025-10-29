import { useThemedStyles } from "@/lib/theme";
import { Alert, Text, TouchableOpacity, View } from "react-native";

import { AuthorIcon, DownloadButton, NarratorIcon, SeriesIcon } from "@/components/icons";
import ChapterList from "@/components/library/LibraryItemDetail/ChapterList";
import DownloadProgressView from "@/components/library/LibraryItemDetail/DownloadProgressView";
import { CollapsibleSection, ProgressBar } from "@/components/ui";
import { getMediaProgressForLibraryItem } from "@/db/helpers/mediaProgress";
import { getUserByUsername } from "@/db/helpers/users";
import { getCoverUri } from "@/lib/covers";
import { useAuth } from "@/providers/AuthProvider";
import { downloadService } from "@/services/DownloadService";
import { playerService } from "@/services/PlayerService";
import { unifiedProgressService } from "@/services/ProgressService";
import { useDownloads, useLibraryItemDetails, usePlayer } from "@/stores";
import { Stack } from "expo-router";
import React, { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from "react-native";
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
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
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
  b: { fontWeight: "bold" },
  strong: { fontWeight: "bold" },
  i: { fontStyle: "italic" },
};

export default function LibraryItemDetail({
  itemId,
  onTitleChange,
}: LibraryItemDetailProps) {
  const { styles, colors, isDark, tabs } = useThemedStyles();
  const { width } = useWindowDimensions();
  const { username, serverUrl, accessToken } = useAuth();
  const { currentTrack, position, isPlaying, isLoadingTrack } = usePlayer();

  // Get store hooks
  const { fetchItemDetails, getCachedItem, updateItemProgress, loading: itemLoading } = useLibraryItemDetails();
  const { activeDownloads, isItemDownloaded, startDownload, deleteDownload } = useDownloads();

  // Get cached item data or null
  const cachedData = useMemo(() => getCachedItem(itemId), [itemId, getCachedItem]);

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

  const htmlSource = useMemo(
    () => ({ html: metadata?.description ?? "" }),
    [metadata]
  );
  const baseStyle = useMemo(
    () => ({ color: colors.textPrimary, fontSize: 16 }),
    [colors]
  );

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
          const title = currentData.metadata.title || "Unknown Title";
          onTitleChange?.(title);
        }
      } catch (error) {
        console.error("[LibraryItemDetail] Error fetching item details:", error);
        onTitleChange?.("Item not found");
      }
    };

    loadItemDetails();
  }, [itemId, username, fetchItemDetails, getCachedItem, onTitleChange]);

  // Update title when metadata changes
  useEffect(() => {
    if (metadata) {
      const title = metadata.title || "Unknown Title";
      onTitleChange?.(title);
    }
  }, [metadata, onTitleChange]);

  // User progress fetching effect - update store with latest progress
  useEffect(() => {
    const fetchUserProgress = async () => {
      if (!username || !item) return;

      try {
        // Fetch latest progress from server
        await unifiedProgressService.fetchServerProgress();

        // Get the local progress data
        const user = await getUserByUsername(username);
        if (user?.id) {
          const progressData = await getMediaProgressForLibraryItem(
            item.id,
            user.id
          );
          // Update progress in store (will trigger re-render via store subscription)
          updateItemProgress(itemId, progressData);
        }
      } catch (error) {
        console.error(
          "[LibraryItemDetail] Error fetching user progress:",
          error
        );
      }
    };

    fetchUserProgress();
  }, [username, item?.id, itemId, updateItemProgress]);

  // Compute effective progress: use live player position if this item is playing,
  // otherwise use stored progress
  const effectiveProgress = useMemo(() => {
    if (!progress || !item) return null;

    // Check if this item is currently playing
    const isThisItemPlaying = currentTrack?.libraryItemId === item.id;

    if (isThisItemPlaying && position !== undefined) {
      // Use live position from player store (updated every second by background service)
      return {
        ...progress,
        currentTime: position,
        progress: progress.duration ? position / progress.duration : 0,
      };
    }

    // Use stored progress
    return progress;
  }, [progress, item?.id, currentTrack?.libraryItemId, position]);

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
        "Download Failed",
        `Failed to download library item: ${error}`,
        [{ text: "OK" }]
      );
    }
  }, [item, serverUrl, accessToken, isDownloading, startDownload]);

  const handleDeleteDownload = useCallback(async () => {
    if (!item) return;

    Alert.alert(
      "Delete Download",
      "Are you sure you want to delete the downloaded files? This will free up storage space.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDownload(item.id);
            } catch (error) {
              console.error(
                "[LibraryItemDetail] Delete download failed:",
                error
              );
              Alert.alert(
                "Delete Failed",
                `Failed to delete downloaded files: ${error}`,
                [{ text: "OK" }]
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
      Alert.alert("Cannot Play", "Item not found.");
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
      Alert.alert("Playback Failed", `Failed to start playback: ${error}`, [
        { text: "OK" },
      ]);
    }
  }, [item, currentTrack]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Item not found.</Text>
      </View>
    );
  }

  // Prefer metadata fields, fallback to item fields
  const title = metadata?.title || "Unknown Title";
  const coverUri = metadata?.imageUrl || (item ? getCoverUri(item.id) : null);
  const description = metadata?.description || "";
  const author = metadata?.authorName || metadata?.author || "Unknown Author";
  const narrator = metadata?.narratorName || null;
  const series = metadata?.seriesName || null;
  const imageSize = width * 0.6;

  return (
    <>
      <ScrollView
        style={{
          flex: 1,
          backgroundColor: styles.container.backgroundColor,
          paddingBottom: currentTrack ? 160 : 100,
        }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: (currentTrack ? 76 : 0) + tabs.tabBarSpace,
        }}
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
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexShrink: 1,
              }}
            >
              <AuthorIcon style={{ marginRight: 8 }} />
              <Text
                style={[styles.text, { textAlign: "center", flexShrink: 1 }]}
              >
                {author}
              </Text>
            </View>
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
                  <Text
                    style={[
                      styles.text,
                      { textAlign: "center", flexShrink: 1 },
                    ]}
                  >
                    {narrator}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
          {series ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
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
                  },
                ]}
              >
                {series}
              </Text>
            </View>
          ) : null}
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
                  ? "Loading..."
                  : currentTrack?.libraryItemId === item?.id && isPlaying
                  ? "Pause"
                  : "Play"}
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
                <Text style={{ fontSize: 12, color: isDark ? "#ccc" : "#333" }}>
                  {g}
                </Text>
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
                <Text style={{ fontSize: 12, color: isDark ? "#ccc" : "#333" }}>
                  {t}
                </Text>
              </View>
            ))}
          </View>
        )}
        {/* Collapsible Description */}
        {description && (
          <CollapsibleSection title="Description" defaultExpanded={true}>
            <RenderHtml
              contentWidth={width - 64}
              source={htmlSource}
              baseStyle={baseStyle}
              tagsStyles={HTMLTagsStyles}
            />
          </CollapsibleSection>
        )}

        {/* Collapsible Chapters */}
        <ChapterList chapters={chapters} />

        {/* Collapsible Audio Files */}
        {audioFiles.length > 0 && (
          <CollapsibleSection title={`Audio Files (${audioFiles.length})`}>
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
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                    Duration:{" "}
                    {file.duration ? formatTime(file.duration) : "Unknown"}
                  </Text>
                  {file.size && (
                    <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                      Size: {(file.size / 1024 / 1024).toFixed(1)} MB
                    </Text>
                  )}
                  {file.downloadInfo?.isDownloaded && (
                    <Text
                      style={[styles.text, { fontSize: 12, color: "#007AFF" }]}
                    >
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
            <DownloadButton
              isDownloaded={isDownloaded}
              onPress={isDownloaded ? handleDeleteDownload : handleDownload}
              disabled={!serverUrl || !accessToken || isDownloading}
            />
          ),
        }}
      />
    </>
  );
}
