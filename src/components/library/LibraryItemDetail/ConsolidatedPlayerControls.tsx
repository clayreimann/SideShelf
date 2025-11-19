import PlayPauseButton from "@/components/player/PlayPauseButton";
import SkipButton from "@/components/player/SkipButton";
import { ProgressBar } from "@/components/ui";
import { getJumpBackwardInterval, getJumpForwardInterval } from "@/lib/appSettings";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { usePlayer } from "@/stores/appStore";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

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
  const { styles, isDark, colors } = useThemedStyles();
  const { currentTrack, position, currentChapter, isPlaying, isLoadingTrack } = usePlayer();
  const [jumpForwardInterval, setJumpForwardInterval] = useState(30);
  const [jumpBackwardInterval, setJumpBackwardInterval] = useState(15);

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

  // Calculate chapter progress
  const chapterPosition = currentChapter?.positionInChapter || 0;
  const chapterDuration = currentChapter?.chapterDuration || 0;
  const chapterProgress = chapterDuration > 0 ? chapterPosition / chapterDuration : 0;
  const chapterTitle = currentChapter?.chapter.title || "";

  const isDisabled = isLoadingTrack || (!isDownloaded && serverReachable === false);

  return (
    <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
      <View
        style={{
          backgroundColor: isDark ? "#333" : "#f5f5f5",
          borderRadius: 8,
          padding: 12,
        }}
      >
        {/* Chapter Progress - only show if this item is currently playing */}
        {isCurrentlyPlaying && chapterTitle && (
          <View style={{ marginBottom: 12 }}>
            <Text
              style={[
                styles.text,
                {
                  fontSize: 14,
                  fontWeight: "600",
                  marginBottom: 8,
                  textAlign: "center",
                },
              ]}
              numberOfLines={1}
            >
              {chapterTitle}
            </Text>
            <ProgressBar
              progress={chapterProgress}
              variant="medium"
              showTimeLabels={true}
              currentTime={chapterPosition}
              duration={chapterDuration}
              showPercentage={false}
            />
          </View>
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
          {/* Skip Backward - only show if currently playing */}
          {isCurrentlyPlaying && (
            <SkipButton
              direction="backward"
              interval={jumpBackwardInterval}
              onPress={handleSkipBackward}
              iconSize={28}
              hitBoxSize={48}
            />
          )}

          {/* Play/Pause Button */}
          <TouchableOpacity
            style={{
              backgroundColor: "#34C759",
              borderRadius: 8,
              paddingVertical: 12,
              paddingHorizontal: isCurrentlyPlaying ? 20 : 32,
              alignItems: "center",
              opacity: isDisabled ? 0.5 : 1,
              flex: isCurrentlyPlaying ? 0 : 1,
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
                ? "Loading..."
                : !isDownloaded && serverReachable === false
                  ? "Offline"
                  : isCurrentlyPlaying && isPlaying
                    ? "Pause"
                    : "Play"}
            </Text>
          </TouchableOpacity>

          {/* Skip Forward - only show if currently playing */}
          {isCurrentlyPlaying && (
            <SkipButton
              direction="forward"
              interval={jumpForwardInterval}
              onPress={handleSkipForward}
              iconSize={28}
              hitBoxSize={48}
            />
          )}

          {/* Open Full Screen Player Button - only show if currently playing */}
          {isCurrentlyPlaying && (
            <TouchableOpacity
              style={{
                width: 48,
                height: 48,
                justifyContent: "center",
                alignItems: "center",
              }}
              onPress={handleOpenFullScreenPlayer}
            >
              <Ionicons name="expand" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
