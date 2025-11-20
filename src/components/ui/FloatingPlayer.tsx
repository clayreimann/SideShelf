/**
 * FloatingPlayer - Mini player UI that floats above the tab bar
 *
 * This component displays when audio is playing and shows:
 * - Item cover image
 * - Current chapter name
 * - Play/pause button
 * - Tapping anywhere else opens the full-screen modal
 */

import PlayPauseButton from "@/components/player/PlayPauseButton";
import CoverImage from "@/components/ui/CoverImange";
import { borderRadius, floatingPlayer, spacing } from "@/lib/styles";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { usePlayer } from "@/stores/appStore";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function FloatingPlayer() {
  const { styles, isDark, colors } = useThemedStyles();
  const { currentTrack, currentChapter } = usePlayer();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  // Don't show if no track is loaded
  if (!currentTrack) {
    return null;
  }

  // Hide floating player if we're on the item details page of the currently playing item
  // Check various routes: /library/[item], /home/item/[itemId], /authors/[authorId]/item/[itemId], /series/[seriesId]/item/[itemId]
  const isOnItemDetailsPage = pathname.includes("/library/") || pathname.includes("/item/");
  if (isOnItemDetailsPage) {
    // Extract item ID from params
    const itemId = params.item || params.itemId;
    // If we're viewing the currently playing item's details page, hide the floating player
    if (itemId === currentTrack.libraryItemId) {
      return null;
    }
  }

  const handlePlayPausePress = async () => {
    try {
      await playerService.togglePlayPause();
    } catch (error) {
      console.error("[FloatingPlayer] Failed to toggle play/pause:", error);
    }
  };

  const handlePlayerPress = () => {
    router.push("/FullScreenPlayer");
  };

  const chapterTitle = currentChapter?.chapter.title || "Loading...";

  return (
    <View
      style={[
        componentStyles.container,
        {
          backgroundColor: isDark ? "#1c1c1e" : "#ffffff",
          borderTopColor: isDark ? "#333" : "#e0e0e0",
          shadowColor: colors.shadow,
        },
      ]}
    >
      {/* Tappable area for opening modal */}
      <Pressable style={componentStyles.pressableArea} onPress={handlePlayerPress}>
        {/* Cover Image */}
        <View style={componentStyles.coverContainer}>
          <CoverImage
            uri={currentTrack?.coverUri ?? ""}
            title={currentTrack?.title ?? "No track selected"}
            fontSize={48}
          />
        </View>

        {/* Track Info */}
        <View style={componentStyles.infoContainer}>
          <Text style={[styles.text, componentStyles.chapterTitle]} numberOfLines={1}>
            {chapterTitle}
          </Text>
          <Text style={[styles.text, componentStyles.trackTitle]} numberOfLines={1}>
            {currentTrack?.title ?? "No selection"}
          </Text>
        </View>
      </Pressable>

      <PlayPauseButton onPress={handlePlayPausePress} iconSize={32} />
    </View>
  );
}

const componentStyles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: floatingPlayer.bottomOffset,
    left: spacing.md,
    right: spacing.md,
    height: floatingPlayer.height,
    borderRadius: borderRadius.md,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  pressableArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  coverContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.sm,
    marginRight: spacing.md,
    overflow: "hidden",
  },
  infoContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  chapterTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  trackTitle: {
    fontSize: 12,
    opacity: 0.7,
  },
});
