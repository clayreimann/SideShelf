/**
 * FullScreenPlayer - Full-screen modal audio player controller
 *
 * This component provides comprehensive audio controls including:
 * - Drag pill (iOS) + custom header row (chevron dismiss, AirPlay, UIMenu gear)
 * - Large cover image
 * - Progress bar with seek functionality
 * - Current time and chapter information
 * - Play/pause, skip forward/backward controls
 * - Playback rate and volume controls
 */

import BookmarkButton from "@/components/player/BookmarkButton";
import ChapterList from "@/components/player/ChapterList";
import JumpTrackButton from "@/components/player/JumpTrackButton";
import PlaybackSpeedControl from "@/components/player/PlaybackSpeedControl";
import PlayPauseButton from "@/components/player/PlayPauseButton";
import SkipButton from "@/components/player/SkipButton";
import SleepTimerControl from "@/components/player/SleepTimerControl";
import { ProgressBar } from "@/components/ui";
import { AirPlayButton } from "@/components/ui/AirPlayButton";
import CoverImage from "@/components/ui/CoverImange";
import { formatTime } from "@/lib/helpers/formatters";
import { formatProgress } from "@/lib/helpers/progressFormat";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { useAppStore, usePlayer, useSettings, useUserProfile } from "@/stores/appStore";
import { Ionicons } from "@expo/vector-icons";
import { MenuView } from "@react-native-menu/menu";
import { useKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  PanResponder,
  Platform,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatBookmarkTime(seconds: number): string {
  const totalSecs = Math.floor(seconds);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const secsStr = `${secs.toString().padStart(2, "0")}s`;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secsStr}`;
  }
  return `${minutes}m ${secsStr}`;
}

/**
 * Guard component that activates keep-awake using a hook.
 * Defined outside FullScreenPlayer to avoid conditional hook rules.
 */
function KeepAwakeGuard() {
  useKeepAwake("sideshelf-player");
  return null;
}

export default function FullScreenPlayer() {
  const { styles, isDark, colors } = useThemedStyles();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const { currentTrack, position, currentChapter, playbackRate, isPlaying } = usePlayer();
  const { createBookmark } = useUserProfile();
  const {
    jumpForwardInterval,
    jumpBackwardInterval,
    progressFormat,
    chapterBarShowRemaining,
    keepScreenAwake,
    updateProgressFormat,
    updateChapterBarShowRemaining,
    updateKeepScreenAwake,
  } = useSettings();

  const [isSeekingSlider, setIsSeekingSlider] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [showChapterList, setShowChapterList] = useState(false);
  const [isCreatingBookmark, setIsCreatingBookmark] = useState(false);

  // Animation values
  const coverSizeAnim = useRef(new Animated.Value(0)).current; // 0 = full size, 1 = minimized
  const chapterListAnim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = visible

  // Swipe down gesture handler - only applies to cover/title/progress area
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to downward swipes (positive dy) that are mostly vertical
        return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        // Allow the gesture to move freely
        return true;
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped down more than 100px, dismiss the modal
        if (gestureState.dy > 100) {
          handleClose();
        }
      },
    })
  ).current;

  // Animate chapter list visibility
  useEffect(() => {
    Animated.parallel([
      Animated.timing(coverSizeAnim, {
        toValue: showChapterList ? 1 : 0,
        duration: 300,
        useNativeDriver: false, // Cannot use native driver for width/height
      }),
      Animated.timing(chapterListAnim, {
        toValue: showChapterList ? 1 : 0,
        duration: 300,
        useNativeDriver: false, // Need to animate height, so can't use native driver
      }),
    ]).start();
  }, [showChapterList, coverSizeAnim, chapterListAnim]);

  const toggleChapterList = useCallback(() => {
    setShowChapterList((prev) => !prev);
  }, []);

  const handleChapterPress = useCallback(async (chapterStart: number) => {
    try {
      await playerService.seekTo(chapterStart);
      setShowChapterList(false); // Close chapter list after selection
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to seek to chapter:", error);
    }
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handlePlayPause = useCallback(async () => {
    try {
      await playerService.togglePlayPause();
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to toggle play/pause:", error);
    }
  }, []);

  const handleSeekStart = useCallback((value: number) => {
    setIsSeekingSlider(true);
    setSliderValue(value);
  }, []);

  const handleSeekChange = useCallback((value: number) => {
    setSliderValue(value);
  }, []);

  const handleSeekComplete = useCallback(async (value: number) => {
    setIsSeekingSlider(false);
    try {
      await playerService.seekTo(value);
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to seek:", error);
    }
  }, []);

  const handleSkipBackward = useCallback(async () => {
    try {
      await playerService.seekTo(Math.max(position - jumpBackwardInterval, 0));
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to skip backward:", error);
    }
  }, [position, jumpBackwardInterval]);

  const handleSkipForward = useCallback(async () => {
    try {
      await playerService.seekTo(position + jumpForwardInterval);
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to skip forward:", error);
    }
  }, [position, jumpForwardInterval]);

  const handleJumpBackward = useCallback(
    async (seconds: number) => {
      try {
        await playerService.seekTo(Math.max(position - seconds, 0));
      } catch (error) {
        console.error("[FullScreenPlayer] Failed to jump backward:", error);
      }
    },
    [position]
  );

  const handleJumpForward = useCallback(
    async (seconds: number) => {
      try {
        await playerService.seekTo(position + seconds);
      } catch (error) {
        console.error("[FullScreenPlayer] Failed to jump forward:", error);
      }
    },
    [position]
  );

  const handleRateChange = useCallback(async (rate: number) => {
    try {
      await playerService.setRate(rate);
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to set playback rate:", error);
    }
  }, []);

  const handleVolumeChange = useCallback(async (newVolume: number) => {
    try {
      await playerService.setVolume(newVolume);
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to set volume:", error);
    }
  }, []);

  const handleCreateBookmark = useCallback(async () => {
    if (!currentTrack || isCreatingBookmark) {
      return;
    }

    setIsCreatingBookmark(true);
    try {
      const bookmark = await createBookmark(currentTrack.libraryItemId, position);
      Alert.alert("Bookmark Created", `Bookmark created at ${formatBookmarkTime(position)}`);
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to create bookmark:", error);
      Alert.alert("Error", "Failed to create bookmark. Please try again.");
    } finally {
      setIsCreatingBookmark(false);
    }
  }, [currentTrack, position, createBookmark, isCreatingBookmark]);

  const handleStartOfChapter = useCallback(async () => {
    if (!currentChapter) {
      return;
    }
    try {
      await playerService.seekTo(currentChapter?.chapter.start || 0);
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to seek to start:", error);
    }
  }, [currentChapter]);

  const handleNextChapter = useCallback(async () => {
    if (!currentChapter) {
      return;
    }
    try {
      const chapterEnd = currentChapter?.chapter.end || 0;
      await playerService.seekTo(chapterEnd + 0.1); // Seek just past end to trigger next chapter
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to seek to next chapter:", error);
    }
  }, [currentChapter]);

  const handleMenuAction = useCallback(
    (actionId: string) => {
      if (actionId === "progressFormat-remaining") updateProgressFormat("remaining");
      else if (actionId === "progressFormat-elapsed") updateProgressFormat("elapsed");
      else if (actionId === "progressFormat-percent") updateProgressFormat("percent");
      else if (actionId === "chapterBar-total") updateChapterBarShowRemaining(false);
      else if (actionId === "chapterBar-remaining") updateChapterBarShowRemaining(true);
      else if (actionId === "keepAwake") updateKeepScreenAwake(!keepScreenAwake);
    },
    [
      progressFormat,
      chapterBarShowRemaining,
      keepScreenAwake,
      updateProgressFormat,
      updateChapterBarShowRemaining,
      updateKeepScreenAwake,
    ]
  );

  if (!currentTrack) {
    return null;
  }

  const duration = currentTrack.duration;
  const currentPosition = position;
  const chapterTitle = currentChapter?.chapter.title || "Loading...";
  const chapterPosition = currentChapter?.positionInChapter || 0;
  const chapterDuration = currentChapter?.chapterDuration || 0;

  const fullCoverSize = Math.min(width - 64, height * 0.4);
  const minimizedCoverSize = 60;

  // Interpolate cover size based on animation
  const animatedCoverSize = coverSizeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [fullCoverSize, minimizedCoverSize],
  });

  const animatedCoverMarginBottom = coverSizeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 8],
  });

  const chapters = currentTrack?.chapters || [];

  // Compute rightLabel for chapter progress bar based on setting
  const chapterBarRightLabel = chapterBarShowRemaining
    ? `-${formatTime(chapterDuration - chapterPosition)}`
    : undefined; // undefined = ProgressBar uses its default formatTime(duration)

  return (
    <>
      {/* Keep screen awake during active playback when setting is enabled */}
      {keepScreenAwake && isPlaying && <KeepAwakeGuard />}

      {/* Drag pill — iOS only, sits above the header row */}
      {Platform.OS === "ios" && (
        <View style={{ alignItems: "center", paddingTop: insets.top + 4 }}>
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: "rgba(128,128,128,0.4)",
              marginBottom: 6,
            }}
          />
        </View>
      )}

      {/* Custom header row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          marginBottom: 8,
          ...(Platform.OS !== "ios" ? { paddingTop: insets.top + 4 } : {}),
        }}
      >
        <TouchableOpacity
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <AirPlayButton style={{ width: 32, height: 32, marginRight: 12 }} />
        <MenuView
          title=""
          shouldOpenOnLongPress={false}
          onPressAction={({ nativeEvent }) => handleMenuAction(nativeEvent.event)}
          actions={[
            {
              id: "progressFormat",
              title: "Progress Format",
              subactions: [
                {
                  id: "progressFormat-remaining",
                  title: "Time Remaining",
                  state: progressFormat === "remaining" ? "on" : "off",
                },
                {
                  id: "progressFormat-elapsed",
                  title: "Elapsed",
                  state: progressFormat === "elapsed" ? "on" : "off",
                },
                {
                  id: "progressFormat-percent",
                  title: "Percent Complete",
                  state: progressFormat === "percent" ? "on" : "off",
                },
              ],
            },
            {
              id: "chapterBarTime",
              title: "Chapter Bar Time",
              subactions: [
                {
                  id: "chapterBar-total",
                  title: "Show Total Duration",
                  state: !chapterBarShowRemaining ? "on" : "off",
                },
                {
                  id: "chapterBar-remaining",
                  title: "Show Time Remaining",
                  state: chapterBarShowRemaining ? "on" : "off",
                },
              ],
            },
            {
              id: "keepAwake",
              title: "Keep Screen Awake",
              state: keepScreenAwake ? "on" : "off",
            },
          ]}
        >
          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </MenuView>
      </View>

      {/* Content */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 32,
          justifyContent: "center",
        }}
      >
        {/* Swipeable area: Cover, Title, and Progress Bar */}
        <View {...panResponder.panHandlers}>
          {/* Cover and Track Info */}
          <View style={{ alignItems: "center" }}>
            {/* Cover Image - Animated */}
            <Animated.View
              style={{
                width: animatedCoverSize,
                height: animatedCoverSize,
                borderRadius: 12,
                marginBottom: animatedCoverMarginBottom,
                overflow: "hidden",
              }}
            >
              <CoverImage uri={currentTrack.coverUri} title={currentTrack.title} fontSize={48} />
            </Animated.View>

            {/* Track Info */}
            <Text
              style={[
                styles.text,
                {
                  fontSize: 24,
                  textAlign: "center",
                  marginBottom: 8,
                },
              ]}
              numberOfLines={2}
            >
              {chapterTitle}
            </Text>
          </View>
          <ProgressBar
            progress={chapterPosition / chapterDuration}
            variant="large"
            interactive={true}
            minValue={currentChapter?.chapter.start || 0}
            maxValue={currentChapter?.chapter.end || chapterDuration}
            onSeekStart={handleSeekStart}
            onSeekChange={handleSeekChange}
            onSeekComplete={handleSeekComplete}
            showTimeLabels={true}
            currentTime={chapterPosition}
            duration={chapterDuration}
            containerStyle={{ marginBottom: 8 }}
            showPercentage={true}
            customPercentageText={formatProgress(progressFormat, currentPosition, duration)}
            rightLabel={chapterBarRightLabel}
          />
        </View>

        <View>
          {chapters.length > 0 && (
            <TouchableOpacity
              onPress={toggleChapterList}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                marginBottom: 8,
                alignItems: "center",
              }}
            >
              <Text style={[styles.text, { fontSize: 12, opacity: 0.5 }]}>
                {showChapterList ? "Hide Chapters" : `Show Chapters (${chapters.length})`}
              </Text>
            </TouchableOpacity>
          )}

          <ChapterList
            chapters={chapters}
            currentChapter={currentChapter}
            position={position}
            onChapterPress={handleChapterPress}
            showChapterList={showChapterList}
            chapterListAnim={chapterListAnim}
            containerHeight={height * 0.4}
          />
        </View>

        {/* Main Controls */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <JumpTrackButton
            direction="backward"
            onPress={handleStartOfChapter}
            hitBoxSize={60}
            iconSize={32}
          />
          <SkipButton
            direction="backward"
            interval={jumpBackwardInterval}
            onPress={handleSkipBackward}
            onJump={handleJumpBackward}
            iconSize={32}
            hitBoxSize={60}
          />
          <PlayPauseButton onPress={handlePlayPause} hitBoxSize={88} iconSize={64} />
          <SkipButton
            direction="forward"
            interval={jumpForwardInterval}
            onPress={handleSkipForward}
            onJump={handleJumpForward}
            iconSize={32}
            hitBoxSize={60}
          />
          <JumpTrackButton
            direction="forward"
            onPress={handleNextChapter}
            hitBoxSize={60}
            iconSize={32}
          />
        </View>

        {/* Secondary Controls */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 16,
            gap: 32,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.text, { fontSize: 12, opacity: 0.7, marginBottom: 8 }]}>
              Speed
            </Text>
            <PlaybackSpeedControl />
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.text, { fontSize: 12, opacity: 0.7, marginBottom: 8 }]}>
              Bookmark
            </Text>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <BookmarkButton
                isCreating={isCreatingBookmark}
                onPress={handleCreateBookmark}
                disabled={isCreatingBookmark}
                iconSize={24}
                hitBoxSize={48}
              />
            </View>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={[styles.text, { fontSize: 12, opacity: 0.7, marginBottom: 8 }]}>
              Sleep Timer
            </Text>
            <SleepTimerControl />
          </View>
        </View>
      </View>
    </>
  );
}
