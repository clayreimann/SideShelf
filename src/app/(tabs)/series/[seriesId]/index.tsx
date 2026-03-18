import { PaddedFlatList, ProgressBar } from "@/components/ui";
import CoverImage from "@/components/ui/CoverImage";
import { MediaProgressRow } from "@/db/helpers/mediaProgress";
import { SeriesBookRow } from "@/db/helpers/series";
import { translate } from "@/i18n";
import { formatTime } from "@/lib/helpers/formatters";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useAppStore, useDownloads, useNetwork, useSeries } from "@/stores";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";

export default function SeriesDetailScreen() {
  const { styles, colors } = useThemedStyles();
  const { series: seriesList, ready, isInitializing, refetchSeries } = useSeries();
  const router = useRouter();
  const params = useLocalSearchParams<{ seriesId?: string | string[] }>();
  const seriesId = Array.isArray(params.seriesId) ? params.seriesId[0] : params.seriesId;
  const { userId, isAuthenticated } = useAuth();
  const { startDownload, isItemDownloaded } = useDownloads();
  const { serverReachable } = useNetwork();
  const progressMapRaw = useAppStore((state) => state.series.progressMap);
  const fetchSeriesProgress = useAppStore((state) => state.fetchSeriesProgress);

  // Convert plain object progressMap from store to Map for backward-compatible usage
  const progressMap = useMemo(
    () =>
      new Map<string, MediaProgressRow>(
        Object.entries(progressMapRaw) as [string, MediaProgressRow][]
      ),
    [progressMapRaw]
  );

  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const selectedSeries = useMemo(
    () => seriesList.find((serie) => serie.id === seriesId),
    [seriesList, seriesId]
  );

  useFocusEffect(
    useCallback(() => {
      if (!ready || selectedSeries) return;
      refetchSeries().catch((error) => {
        console.error("[SeriesDetailScreen] Failed to refetch series:", error);
      });
    }, [ready, selectedSeries, refetchSeries])
  );

  // Fetch progress data for all books in the series on every focus (stale-while-revalidate)
  useFocusEffect(
    useCallback(() => {
      if (!seriesId || !userId) return;
      fetchSeriesProgress(seriesId, userId).catch((error) => {
        console.error("[SeriesDetailScreen] Failed to fetch series progress:", error);
      });
    }, [seriesId, userId, fetchSeriesProgress])
  );

  // Handler for downloading all unfinished items in the series
  const handleDownloadAllUnfinished = useCallback(async () => {
    if (!selectedSeries || !isAuthenticated || isDownloadingAll) return;

    // Check if server is reachable
    if (serverReachable === false) {
      Alert.alert("Server Offline", "Cannot start downloads while server is offline.", [
        { text: "OK" },
      ]);
      return;
    }

    // Find all unfinished items
    const unfinishedItems = selectedSeries.books.filter((book) => {
      const progress = progressMap.get(book.libraryItemId);
      const downloaded = isItemDownloaded(book.libraryItemId);

      // Item is unfinished if: not downloaded AND (no progress OR not finished)
      return !downloaded && (!progress || !progress.isFinished);
    });

    if (unfinishedItems.length === 0) {
      Alert.alert(
        "No Unfinished Items",
        "All items in this series are either finished or already downloaded.",
        [{ text: "OK" }]
      );
      return;
    }

    // Confirm download
    Alert.alert(
      "Download Unfinished Items",
      `Download ${unfinishedItems.length} unfinished ${unfinishedItems.length === 1 ? "item" : "items"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Download",
          onPress: async () => {
            setIsDownloadingAll(true);
            try {
              // Start downloads sequentially to avoid overwhelming the system
              for (const item of unfinishedItems) {
                try {
                  await startDownload(item.libraryItemId);
                } catch (error) {
                  console.error(`[SeriesDetailScreen] Failed to download ${item.title}:`, error);
                  // Continue with other downloads even if one fails
                }
              }

              Alert.alert(
                "Downloads Started",
                `Started downloading ${unfinishedItems.length} ${unfinishedItems.length === 1 ? "item" : "items"}.`,
                [{ text: "OK" }]
              );
            } catch (error) {
              console.error("[SeriesDetailScreen] Error downloading items:", error);
              Alert.alert("Download Error", `Failed to start downloads: ${String(error)}`, [
                { text: "OK" },
              ]);
            } finally {
              setIsDownloadingAll(false);
            }
          },
        },
      ]
    );
  }, [
    selectedSeries,
    isAuthenticated,
    isDownloadingAll,
    serverReachable,
    progressMap,
    isItemDownloaded,
    startDownload,
  ]);

  const renderBook = useCallback(
    ({ item }: { item: SeriesBookRow }) => {
      const sequenceLabel = item.sequence ? `Book ${item.sequence}` : null;
      const progress = progressMap.get(item.libraryItemId);
      const downloaded = isItemDownloaded(item.libraryItemId);

      return (
        <TouchableOpacity
          onPress={() => seriesId && router.push(`/series/${seriesId}/item/${item.libraryItemId}`)}
          style={{
            flexDirection: "row",
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: (styles.text.color || "#000000") + "20",
            gap: 12,
          }}
          accessibilityRole="button"
          accessibilityHint={`Open details for ${item.title}`}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 6,
              overflow: "hidden",
              backgroundColor: colors.coverBackground,
            }}
          >
            <CoverImage
              uri={item.coverUrl}
              title={item.title}
              fontSize={12}
              libraryItemId={item.libraryItemId}
            />
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={[styles.text, { fontSize: 16, fontWeight: "600" }]} numberOfLines={2}>
              {item.title}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 4,
                justifyContent: "flex-start",
                gap: 12,
              }}
            >
              {sequenceLabel && (
                <Text style={[styles.text, { opacity: 0.6, fontSize: 12 }]}>{sequenceLabel}</Text>
              )}
              {item.duration !== null && (
                <Text style={[styles.text, { opacity: 0.6, fontSize: 12, marginTop: 2 }]}>
                  {formatTime(item.duration)}
                </Text>
              )}
            </View>
            {/* Progress bar */}
            {progress &&
              !progress.isFinished &&
              progress.currentTime &&
              progress.currentTime > 0 && (
                <View style={{ marginTop: 6 }}>
                  <ProgressBar
                    progress={progress.progress || 0}
                    variant="small"
                    showTimeLabels={false}
                    showPercentage={false}
                  />
                </View>
              )}
            {progress && progress.isFinished && (
              <Text style={[styles.text, { fontSize: 12, marginTop: 4, opacity: 0.6 }]}>
                {translate("libraryItem.progress.finshed")}
              </Text>
            )}
            {/* Download status */}
            {downloaded && (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                <Ionicons name="checkmark-circle" size={14} color="#34C759" />
                <Text style={[styles.text, { fontSize: 12, color: "#34C759", marginLeft: 4 }]}>
                  Downloaded
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [colors.coverBackground, router, seriesId, styles.text.color, progressMap, isItemDownloaded]
  );

  if (!seriesId) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.text}>Series not found.</Text>
        <Stack.Screen options={{ title: "Series" }} />
      </View>
    );
  }

  if (!ready || (isInitializing && !selectedSeries)) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.link} />
        <Text style={[styles.text, { marginTop: 12, opacity: 0.7 }]}>Loading series...</Text>
        <Stack.Screen options={{ title: "Series" }} />
      </View>
    );
  }

  if (!selectedSeries) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
        ]}
      >
        <Text style={[styles.text, { textAlign: "center", marginBottom: 16 }]}>
          We could not find that series.
        </Text>
        <Stack.Screen options={{ title: "Series" }} />
      </View>
    );
  }

  return (
    <>
      <PaddedFlatList
        data={selectedSeries.books}
        keyExtractor={(item) => item.libraryItemId}
        renderItem={renderBook}
        ListEmptyComponent={
          <View style={{ padding: 24, alignItems: "center" }}>
            <Text style={[styles.text, { opacity: 0.7 }]}>No books found in this series.</Text>
          </View>
        }
        contentContainerStyle={styles.flatListContainer}
      />
      <Stack.Screen
        options={{
          title: selectedSeries.name || "Series",
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDownloadAllUnfinished}
              disabled={isDownloadingAll || serverReachable === false}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 4,
                opacity: isDownloadingAll || serverReachable === false ? 0.5 : 1,
              }}
            >
              {isDownloadingAll ? (
                <ActivityIndicator size="small" color={colors.link} />
              ) : (
                <Ionicons name="download-outline" size={24} color={colors.link} />
              )}
            </TouchableOpacity>
          ),
        }}
      />
    </>
  );
}
