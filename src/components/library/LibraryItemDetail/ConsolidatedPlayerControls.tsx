import BookmarkButton from "@/components/player/BookmarkButton";
import FullScreenButton from "@/components/player/FullScreenButton";
import PlayPauseButton from "@/components/player/PlayPauseButton";
import SkipButton from "@/components/player/SkipButton";
import { ProgressBar } from "@/components/ui";
import { translate } from "@/i18n";
import { getJumpBackwardInterval, getJumpForwardInterval } from "@/lib/appSettings";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { usePlayer, useUserProfile } from "@/stores/appStore";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";

interface ConsolidatedPlayerControlsProps {
  libraryItemId: string;
  isDownloaded: boolean;
  serverReachable: boolean | null;
}

export default function ConsolidatedPlayerControls({
  libraryItemId,
  isDownloaded,
  serverReachable,
}: ConsolidatedPlayerControlsProps) {
  const { isDark, colors } = useThemedStyles();
  const { currentTrack, position, currentChapter, isLoadingTrack } = usePlayer();
  const { createBookmark } = useUserProfile();
  const [jumpForwardInterval, setJumpForwardInterval] = useState(30);
  const [jumpBackwardInterval, setJumpBackwardInterval] = useState(15);
  const [isCreatingBookmark, setIsCreatingBookmark] = useState(false);

  // Check if this is the currently playing item
  const isCurrentlyPlaying = currentTrack?.libraryItemId === libraryItemId;

  // Load jump intervals from settings
  useEffect(() => {
    const loadIntervals = async () => {
      const [forward, backward] = await Promise.all([
        getJumpForwardInterval(),
        getJumpBackwardInterval(),
      ]);
      setJumpForwardInterval(forward);
      setJumpBackwardInterval(backward);
    };
    loadIntervals();
  }, []);

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
      await playerService.seekTo(Math.max(position - jumpBackwardInterval, 0));
    } catch (error) {
      console.error("[ConsolidatedPlayerControls] Failed to skip backward:", error);
    }
  }, [position, jumpBackwardInterval]);

  const handleSkipForward = useCallback(async () => {
    try {
      await playerService.seekTo(position + jumpForwardInterval);
    } catch (error) {
      console.error("[ConsolidatedPlayerControls] Failed to skip forward:", error);
    }
  }, [position, jumpForwardInterval]);

  const handleOpenFullScreenPlayer = useCallback(() => {
    router.push("/FullScreenPlayer");
  }, []);

  const handleCreateBookmark = useCallback(async () => {
    if (!currentTrack || isCreatingBookmark) {
      return;
    }

    setIsCreatingBookmark(true);
    try {
      await createBookmark(currentTrack.libraryItemId, position);
      Alert.alert("Bookmark Created", "Bookmark created successfully");
    } catch (error) {
      console.error("[ConsolidatedPlayerControls] Failed to create bookmark:", error);
      Alert.alert("Error", "Failed to create bookmark. Please try again.");
    } finally {
      setIsCreatingBookmark(false);
    }
  }, [currentTrack, position, createBookmark, isCreatingBookmark]);

  // Calculate chapter progress
  const chapterPosition = currentChapter?.positionInChapter || 0;
  const chapterDuration = currentChapter?.chapterDuration || 0;
  const chapterProgress = chapterDuration > 0 ? chapterPosition / chapterDuration : 0;
  const chapterTitle = currentChapter?.chapter.title || "";

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
    <View
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
          <ProgressBar
            progress={chapterProgress}
            variant="medium"
            showTimeLabels={true}
            currentTime={chapterPosition}
            duration={chapterDuration}
            showPercentage={false}
          />
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
          <PlayPauseButton onPress={handlePlayPause} iconSize={48} hitBoxSize={48} />

          {/* Skip Forward - only show if currently playing */}
          <SkipButton
            direction="forward"
            interval={jumpForwardInterval}
            onPress={handleSkipForward}
            iconSize={32}
            hitBoxSize={48}
          />

          {/* Open Full Screen Player Button - only show if currently playing */}
          <FullScreenButton onPress={handleOpenFullScreenPlayer} iconSize={24} hitBoxSize={48} />
        </View>
      </View>
    </View>
  );
}
