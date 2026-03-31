import { OfflineIcon } from "@/components/icons";
import { useThemedStyles } from "@/lib/theme";
import { useDownloads, useNetwork } from "@/stores";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Platform, StyleSheet, Text, View } from "react-native";

export interface CoverImageProps {
  uri: string | null;
  title: string | null;
  fontSize: number;
  /** Library item ID to check download status */
  libraryItemId?: string;
}

export default function CoverImage({ uri, title, fontSize, libraryItemId }: CoverImageProps) {
  const { colors } = useThemedStyles();
  const { isConnected, isInternetReachable } = useNetwork();
  const { isItemDownloaded, isItemPartiallyDownloaded } = useDownloads();

  // Determine if we should show the offline icon
  const isOffline = !isConnected || isInternetReachable === false;
  const isDownloaded = libraryItemId ? isItemDownloaded(libraryItemId) : false;
  const isPartiallyDownloaded = libraryItemId ? isItemPartiallyDownloaded(libraryItemId) : false;
  const showOfflineIcon = isOffline && !isDownloaded && libraryItemId;

  return (
    <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={libraryItemId}
        />
      ) : (
        <Text
          style={{ color: colors.textPrimary, fontSize, textAlign: "center", paddingHorizontal: 6 }}
          numberOfLines={3}
        >
          {title || "Untitled"}
        </Text>
      )}

      {/* Light gray overlay for undownloaded items */}
      {libraryItemId && !isDownloaded && <View testID="dim-overlay" style={styles.dimOverlay} />}

      {/* Download badge — bottom right, indicates item is not yet downloaded */}
      {libraryItemId && !isDownloaded && (
        <View style={styles.downloadBadge}>
          {Platform.OS === "ios" ? (
            <SymbolView name="arrow.down" size={10} tintColor="white" type="monochrome" />
          ) : (
            <MaterialCommunityIcons name="arrow-down" size={10} color="white" />
          )}
        </View>
      )}

      {/* Show offline cloud icon for non-downloaded items when offline */}
      {showOfflineIcon && (
        <View style={styles.offlineIconContainer}>
          <View style={styles.offlineIconBackground}>
            <OfflineIcon />
          </View>
        </View>
      )}

      {/* Show partial badge for items with some (not all) files downloaded */}
      {isPartiallyDownloaded && !isDownloaded && (
        <View style={styles.partialBadgeContainer}>
          <View style={styles.partialBadgeBackground}>
            <Text style={styles.partialBadgeText}>Partial</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dimOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(200, 200, 200, 0.8)",
  },
  downloadBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderRadius: 4,
    padding: 3,
  },
  offlineIconContainer: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  offlineIconBackground: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 12,
    padding: 4,
  },
  partialBadgeContainer: {
    position: "absolute",
    top: 4,
    left: 4,
  },
  partialBadgeBackground: {
    backgroundColor: "rgba(180, 120, 0, 0.75)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  partialBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
});
