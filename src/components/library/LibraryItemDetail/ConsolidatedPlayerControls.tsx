import BookmarkButton from "@/components/player/BookmarkButton";
import PlayPauseButton from "@/components/player/PlayPauseButton";
import SkipButton from "@/components/player/SkipButton";
import { ProgressBar } from "@/components/ui";
import { AirPlayButton } from "@/components/ui/AirPlayButton";
import { translate } from "@/i18n";
import { getAutoBookmarkTitle } from "@/lib/helpers/bookmarks";
import { formatTime } from "@/lib/helpers/formatters";
import { formatProgress } from "@/lib/helpers/progressFormat";
import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { trace } from "@/lib/trace";
import { writeDumpToDisk } from "@/lib/traceDump";
import { playerService } from "@/services/PlayerService";
import { usePlayer, useSettings, useUserProfile } from "@/stores/appStore";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, Text, TouchableOpacity, View } from "react-native";

const log = logger.forTag("ConsolidatedPlayerControls");

interface ConsolidatedPlayerControlsProps {
  libraryItemId: string;
  isDownloaded: boolean;
  serverReachable: boolean | null;
  initialBookmarkPosition: number;
}

export default function ConsolidatedPlayerControls({
  libraryItemId,
  isDownloaded,
  serverReachable,
  initialBookmarkPosition,
}: ConsolidatedPlayerControlsProps) {
  const { colors } = useThemedStyles();
  const { currentTrack, position, currentChapter, isLoadingTrack } = usePlayer();
  const { createBookmark } = useUserProfile();
  const { jumpForwardInterval, jumpBackwardInterval, progressFormat, chapterBarShowRemaining } =
    useSettings();
  const [isCreatingBookmark, setIsCreatingBookmark] = useState(false);

  // Check if this is the currently playing item
  const isCurrentlyPlaying = currentTrack?.libraryItemId === libraryItemId;

  const handlePlayPause = useCallback(async () => {
    try {
      if (isCurrentlyPlaying) {
        // Toggle play/pause for currently playing item
        await playerService.togglePlayPause();
      } else {
        // Play this item
        await playerService.playTrack(libraryItemId);
      }
    } catch (error) {
      console.error("[ConsolidatedPlayerControls] Failed to toggle play/pause:", error);
    }
  }, [isCurrentlyPlaying, libraryItemId]);

  const handleSkipBackward = useCallback(async () => {
    try {
      const targetPosition = Math.max(position - jumpBackwardInterval, 0);
      trace.addEvent("player.ui.skip", {
        direction: "backward",
        fromPositionMs: Math.round(position * 1000),
        targetPositionMs: Math.round(targetPosition * 1000),
        intervalSeconds: jumpBackwardInterval,
      });
      await playerService.seekTo(targetPosition);
    } catch (error) {
      console.error("[ConsolidatedPlayerControls] Failed to skip backward:", error);
    }
  }, [position, jumpBackwardInterval]);

  const handleSkipForward = useCallback(async () => {
    try {
      const targetPosition = position + jumpForwardInterval;
      trace.addEvent("player.ui.skip", {
        direction: "forward",
        fromPositionMs: Math.round(position * 1000),
        targetPositionMs: Math.round(targetPosition * 1000),
        intervalSeconds: jumpForwardInterval,
      });
      await playerService.seekTo(targetPosition);
    } catch (error) {
      console.error("[ConsolidatedPlayerControls] Failed to skip forward:", error);
    }
  }, [position, jumpForwardInterval]);

  const handleOpenFullScreenPlayer = useCallback(() => {
    router.push("/FullScreenPlayer");
  }, []);

  const handlePlayPauseLongPress = useCallback(async () => {
    try {
      await writeDumpToDisk("manual");
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      log.error("[handlePlayPauseLongPress] Trace dump failed", err as Error);
    }
  }, []);

  const handleCreateBookmark = useCallback(async () => {
    if (!currentTrack || isCreatingBookmark) {
      return;
    }

    const bookmarkPosition = position > 0 ? position : initialBookmarkPosition;
    const bookmarkTitle = getAutoBookmarkTitle({
      chapterTitle: currentChapter?.chapter.title,
      position: bookmarkPosition,
    });

    setIsCreatingBookmark(true);
    try {
      await createBookmark(currentTrack.libraryItemId, bookmarkPosition, bookmarkTitle);
      Alert.alert("Bookmark Created", "Bookmark created successfully");
    } catch (error) {
      console.error("[ConsolidatedPlayerControls] Failed to create bookmark:", error);
      Alert.alert("Error", "Failed to create bookmark. Please try again.");
    } finally {
      setIsCreatingBookmark(false);
    }
  }, [
    currentTrack,
    position,
    currentChapter,
    initialBookmarkPosition,
    createBookmark,
    isCreatingBookmark,
  ]);

  // Calculate chapter progress
  const chapterPosition = currentChapter?.positionInChapter || 0;
  const chapterDuration = currentChapter?.chapterDuration || 0;
  const chapterProgress = chapterDuration > 0 ? chapterPosition / chapterDuration : 0;
  const chapterTitle = currentChapter?.chapter.title || "";

  const chapterBarRightLabel = chapterBarShowRemaining
    ? `-${formatTime(chapterDuration - chapterPosition)}`
    : undefined;

  const isDisabled = isLoadingTrack || (!isDownloaded && serverReachable === false);

  if (!isCurrentlyPlaying) {
    return (
      <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
        <TouchableOpacity
          style={{
            backgroundColor: "#34C759",
            borderRadius: 8,
            padding: 12,
            alignItems: "center",
            opacity: isDisabled ? 0.5 : 1,
          }}
          onPress={handlePlayPause}
          disabled={isDisabled}
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
              : !isDownloaded && serverReachable === false
                ? translate("common.offline")
                : translate("common.play")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Pressable
      onPress={handleOpenFullScreenPlayer}
      style={{
        marginBottom: 16,
        paddingHorizontal: 16,
        shadowColor: colors.shadow,
        shadowOpacity: 0.3,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <View
        style={{
          backgroundColor: colors.coverBackground,
          borderRadius: 8,
          padding: 12,
        }}
      >
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <Text style={{ color: colors.textPrimary }}>{chapterTitle}</Text>
        </View>
        {/* Chapter Progress - only show if this item is currently playing */}
        {isCurrentlyPlaying && (
          <>
            <ProgressBar
              progress={chapterProgress}
              variant="medium"
              showTimeLabels={true}
              currentTime={chapterPosition}
              duration={chapterDuration}
              showPercentage={true}
              customPercentageText={formatProgress(
                progressFormat,
                position,
                currentTrack?.duration ?? 0
              )}
              rightLabel={chapterBarRightLabel}
            />
          </>
        )}

        {/* Player Controls */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* Keep the number of items in the row odd to keep play centered */}
          <BookmarkButton
            isCreating={isCreatingBookmark}
            onPress={handleCreateBookmark}
            disabled={isCreatingBookmark}
            iconSize={24}
            hitBoxSize={48}
          />

          {/* Skip Backward - only show if currently playing */}
          <SkipButton
            direction="backward"
            interval={jumpBackwardInterval}
            onPress={handleSkipBackward}
            iconSize={32}
            hitBoxSize={48}
          />

          {/* Play/Pause Button */}
          <PlayPauseButton
            onPress={handlePlayPause}
            onLongPress={handlePlayPauseLongPress}
            iconSize={48}
            hitBoxSize={48}
          />

          {/* Skip Forward - only show if currently playing */}
          <SkipButton
            direction="forward"
            interval={jumpForwardInterval}
            onPress={handleSkipForward}
            iconSize={32}
            hitBoxSize={48}
          />

          {/* AirPlay route picker */}
          <AirPlayButton
            style={{
              width: 48,
              height: 48,
            }}
            tintColor={colors.textPrimary}
            activeTintColor={colors.textPrimary}
          />
        </View>
      </View>
    </Pressable>
  );
}
