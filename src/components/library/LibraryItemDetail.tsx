import { useThemedStyles } from "@/lib/theme";
import { Alert, Text, TouchableOpacity, View } from "react-native";

import { AuthorIcon, DownloadButton, NarratorIcon, SeriesIcon } from "@/components/icons";
import DownloadProgressView from "@/components/library/DownloadProgress";
import { CollapsibleSection, ProgressBar } from "@/components/ui";
import { ChapterRow, getChaptersForMedia } from "@/db/helpers/chapters";
import {
  AudioFileWithDownloadInfo,
  getAudioFilesWithDownloadInfo,
} from "@/db/helpers/combinedQueries";
import { processFullLibraryItems } from "@/db/helpers/fullLibraryItems";
import {
  getLibraryItemById,
  NewLibraryItemRow,
} from "@/db/helpers/libraryItems";
import { getMediaGenres, getMediaTags } from "@/db/helpers/mediaJoins";
import {
  cacheCoverAndUpdateMetadata,
  getMediaMetadataByLibraryItemId,
} from "@/db/helpers/mediaMetadata";
import {
  getMediaProgressForLibraryItem,
  MediaProgressRow,
} from "@/db/helpers/mediaProgress";
import { getUserByUsername } from "@/db/helpers/users";
import { MediaMetadataRow } from "@/db/schema/mediaMetadata";
import { fetchLibraryItemsBatch } from "@/lib/api/endpoints";
import { getCoverUri } from "@/lib/covers";
import { useAuth } from "@/providers/AuthProvider";
import { DownloadProgress, downloadService } from "@/services/DownloadService";
import { playerService } from "@/services/PlayerService";
import { unifiedProgressService } from "@/services/ProgressService";
import { usePlayer } from "@/stores/appStore";
import { Stack } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import RenderHtml from "react-native-render-html";
import CoverImage from "../ui/CoverImange";
import ChapterList from "./LibraryItemDetail/ChapterList";

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

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<NewLibraryItemRow | null>(null);
  const [metadata, setMetadata] = useState<MediaMetadataRow | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [progress, setProgress] = useState<MediaProgressRow | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFileWithDownloadInfo[]>([]);

  // Download states
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const htmlSource = useMemo(
    () => ({ html: metadata?.description ?? "" }),
    [metadata]
  );
  const baseStyle = useMemo(
    () => ({ color: colors.textPrimary, fontSize: 16 }),
    [colors]
  );

  // Main data fetching effect
  useEffect(() => {
    let isMounted = true;

    const fetchBasicData = async () => {
      setLoading(true);
      try {
        const itemRow = await getLibraryItemById(itemId);
        const meta = itemRow
          ? await getMediaMetadataByLibraryItemId(itemRow.id)
          : null;
        const genres = meta ? await getMediaGenres(meta.id) : [];
        const tags = meta ? await getMediaTags(meta.id) : [];

        // Get chapters and audio files if metadata exists
        const chaptersData = meta ? await getChaptersForMedia(meta.id) : [];
        const audioFilesData = meta
          ? await getAudioFilesWithDownloadInfo(meta.id)
          : [];

        // Ensure DownloadService is initialized before checking status
        await downloadService.initialize();

        // Check download status
        const downloadedStatus = itemRow
          ? await downloadService.isLibraryItemDownloaded(itemRow.id)
          : false;
        const isActiveDownload = itemRow
          ? downloadService.isDownloadActive(itemRow.id)
          : false;

        if (isMounted) {
          setItem(itemRow);
          setMetadata(meta);
          setGenres(genres);
          setTags(tags);
          setChapters(chaptersData);
          setAudioFiles(audioFilesData);
          setIsDownloaded(downloadedStatus);
          setIsDownloading(isActiveDownload);

          // Notify parent of title change for header
          const title = meta?.title || "Unknown Title";
          onTitleChange?.(title);
        }
      } catch (e) {
        console.error("[LibraryItemDetail] Error fetching item data:", e);
        if (isMounted) {
          setItem(null);
          setMetadata(null);
          setGenres([]);
          setTags([]);
          setChapters([]);
          setAudioFiles([]);
          onTitleChange?.("Item not found");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (itemId) fetchBasicData();
    return () => {
      isMounted = false;
    };
  }, [itemId, onTitleChange]);

  // User progress fetching effect
  useEffect(() => {
    let isMounted = true;

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
          if (isMounted) {
            setProgress(progressData);
          }
        }
      } catch (error) {
        console.error(
          "[LibraryItemDetail] Error fetching user progress:",
          error
        );
      }
    };

    fetchUserProgress();
    return () => {
      isMounted = false;
    };
  }, [username, item?.id]);

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

  // Background data enhancement effect
  useEffect(() => {
    let isMounted = true;

    const enhanceData = async () => {
      if (!item) return;

      try {
        // Cache cover in background
        const wasDownloaded = await cacheCoverAndUpdateMetadata(item.id);
        if (wasDownloaded && isMounted) {
          console.log(
            "Cover was downloaded for item detail, refreshing metadata"
          );
          const updatedMeta = await getMediaMetadataByLibraryItemId(item.id);
          if (isMounted && updatedMeta) {
            setMetadata(updatedMeta);
          }
        }
      } catch (error) {
        console.error("Failed to cache cover for item detail:", error);
      }

      try {
        // Fetch full item data in background to ensure all relations are populated
        const libraryItems = await fetchLibraryItemsBatch([item.id]);
        if (libraryItems.length > 0 && isMounted) {
          console.log(
            "[LibraryItemDetail] Fetched full item data, processing..."
          );
          await processFullLibraryItems(libraryItems);
          console.log("[LibraryItemDetail] Full item data processed");

          // Refresh the data after processing
          if (metadata && isMounted) {
            const [newChapters, newAudioFiles] = await Promise.all([
              getChaptersForMedia(metadata.id),
              getAudioFilesWithDownloadInfo(metadata.id),
            ]);

            if (isMounted) {
              setChapters(newChapters);
              setAudioFiles(newAudioFiles);
            }
          }
        }
      } catch (error) {
        console.error("[LibraryItemDetail] Error enhancing data:", error);
      }
    };

    enhanceData();
    return () => {
      isMounted = false;
    };
  }, [item?.id, metadata?.id]);

  // Manage download progress subscription
  useEffect(() => {
    if (!item) return;

    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    const setupSubscription = async () => {
      try {
        // Ensure service is initialized before subscribing
        await downloadService.initialize();

        if (!isMounted) return; // Component unmounted during initialization

        // Subscribe to progress updates
        unsubscribe = downloadService.subscribeToProgress(
          item.id,
          (progress) => {
            console.log(
              "[LibraryItemDetail] Progress update received:",
              progress
            );
            setDownloadProgress(progress);

            // Update download state based on progress
            if (progress.status === "completed") {
              setIsDownloading(false);
              setIsDownloaded(true);
              setDownloadProgress(null);
            } else if (
              progress.status === "error" ||
              progress.status === "cancelled"
            ) {
              setIsDownloading(false);
              setDownloadProgress(null);
            } else {
              setIsDownloading(true);
            }
          }
        );

        // Check if download is currently active
        const isActive = downloadService.isDownloadActive(item.id);
        if (isMounted) {
          setIsDownloading(isActive);

          // If there's an active download, get current progress
          if (isActive) {
            const currentProgress = downloadService.getCurrentProgress(item.id);
            if (currentProgress) {
              setDownloadProgress(currentProgress);
            }
          }
        }
      } catch (error) {
        console.error(
          "[LibraryItemDetail] Error setting up download subscription:",
          error
        );
      }
    };

    setupSubscription();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [item?.id]);

  // Download handlers
  const handleDownload = useCallback(async () => {
    if (!item || !serverUrl || !accessToken || isDownloading) return;

    try {
      // Check if download is already active before attempting to start
      await downloadService.initialize();
      if (downloadService.isDownloadActive(item.id)) {
        console.log(
          "[LibraryItemDetail] Download already active, subscribing to progress"
        );
        setIsDownloading(true);
        const currentProgress = downloadService.getCurrentProgress(item.id);
        if (currentProgress) {
          setDownloadProgress(currentProgress);
        }
        return;
      }

      // Set downloading state immediately to show UI feedback
      setIsDownloading(true);

      // Start download with a callback to ensure immediate progress updates
      await downloadService.startDownload(
        item.id,
        serverUrl,
        accessToken,
        (progress) => {
          console.log(
            "[LibraryItemDetail] Direct progress callback:",
            progress
          );
          setDownloadProgress(progress);

          // Update download state based on progress
          if (progress.status === "completed") {
            setIsDownloading(false);
            setIsDownloaded(true);
            setDownloadProgress(null);
          } else if (
            progress.status === "error" ||
            progress.status === "cancelled"
          ) {
            setIsDownloading(false);
            setDownloadProgress(null);
          } else {
            setIsDownloading(true);
          }
        }
      );

      // The progress subscription will handle state updates
      // Refresh audio files to show download status when completed
      if (metadata) {
        const updatedAudioFiles = await getAudioFilesWithDownloadInfo(
          metadata.id
        );
        setAudioFiles(updatedAudioFiles);
      }
    } catch (error) {
      console.error("[LibraryItemDetail] Download failed:", error);

      // Handle the specific case where download is already in progress
      if (
        error instanceof Error &&
        error.message.includes("Download already in progress")
      ) {
        console.log(
          "[LibraryItemDetail] Download already in progress, updating UI state"
        );
        setIsDownloading(true);
        const currentProgress = downloadService.getCurrentProgress(item.id);
        if (currentProgress) {
          setDownloadProgress(currentProgress);
        }
      } else {
        Alert.alert(
          "Download Failed",
          `Failed to download library item: ${error}`,
          [{ text: "OK" }]
        );
        setIsDownloading(false);
      }
    }
  }, [item, serverUrl, accessToken, isDownloading, metadata]);

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
              await downloadService.deleteDownloadedLibraryItem(item.id);
              setIsDownloaded(false);

              // Refresh audio files to show download status
              if (metadata) {
                const updatedAudioFiles = await getAudioFilesWithDownloadInfo(
                  metadata.id
                );
                setAudioFiles(updatedAudioFiles);
              }
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
  }, [item, metadata]);

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
