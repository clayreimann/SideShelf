import { OfflineIcon } from "@/components/icons";
import { useThemedStyles } from "@/lib/theme";
import { useDownloads, useNetwork } from "@/stores";
import { Image, StyleSheet, Text, View } from "react-native";

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
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <Text
          style={{ color: colors.textPrimary, fontSize, textAlign: "center", paddingHorizontal: 6 }}
          numberOfLines={3}
        >
          {title || "Untitled"}
        </Text>
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
