import { useState, useEffect, useCallback } from "react";
import { useThemedStyles } from "@/lib/theme";
import { usePlayerState } from "@/stores";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";

/**
 * PlayPauseButton component
 *
 * Displays a play or pause button with platform-specific icons:
 * - iOS: Uses SF Symbols (play.circle, pause.circle)
 * - Android: Uses Material Icons (play-arrow, pause)
 *
 * Shows an activity indicator while a track is loading.
 *
 * Implements optimistic state (D-13): icon flips immediately on press without
 * waiting for the coordinator's async lock to resolve. The pending state is
 * reconciled once the store catches up.
 *
 * Implements flicker prevention (D-14): the pending state is not cleared while
 * isLoadingTrack is true, preventing the icon from reverting to "play" during
 * coordinator LOADING/BUFFERING intermediate state transitions.
 */
export interface PlayPauseButtonProps {
  hitBoxSize?: number;
  iconSize?: number;
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
}

export default function PlayPauseButton({
  onPress,
  onLongPress,
  hitBoxSize = 44,
  iconSize = 24,
  testID,
}: PlayPauseButtonProps) {
  const { colors } = useThemedStyles();
  const isLoadingTrack = usePlayerState((state) => state.player.loading.isLoadingTrack);
  const isPlaying = usePlayerState((state) => state.player.isPlaying);

  // D-13: Local optimistic state — set immediately on press, cleared when store catches up
  const [pendingIsPlaying, setPendingIsPlaying] = useState<boolean | null>(null);

  // D-13: Display state — prefer pending (optimistic) over store value
  const displayIsPlaying = pendingIsPlaying ?? isPlaying;

  // D-13 + D-14: Reconcile pending state with store once settled.
  // Guard with !isLoadingTrack to prevent clearing optimistic state during
  // coordinator LOADING/BUFFERING transitions (where isPlaying briefly returns false).
  useEffect(() => {
    if (pendingIsPlaying !== null && isPlaying === pendingIsPlaying && !isLoadingTrack) {
      setPendingIsPlaying(null);
    }
  }, [isPlaying, pendingIsPlaying, isLoadingTrack]);

  // D-13: Set optimistic state immediately on press, then invoke the action
  const handlePress = useCallback(() => {
    setPendingIsPlaying(!displayIsPlaying);
    onPress();
  }, [displayIsPlaying, onPress]);

  if (isLoadingTrack && pendingIsPlaying === null) {
    // Only show spinner when truly in initial loading with no pending action
    return (
      <View
        style={{
          width: hitBoxSize,
          height: hitBoxSize,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="small" color={colors.textPrimary} />
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: hitBoxSize,
        height: hitBoxSize,
        justifyContent: "center",
        alignItems: "center",
        opacity: pressed ? 0.5 : 1,
      })}
    >
      {Platform.OS === "ios" ? (
        <SymbolView
          name={displayIsPlaying ? "pause.circle.fill" : "play.circle.fill"}
          size={iconSize}
          tintColor={colors.textPrimary}
        />
      ) : (
        <MaterialIcons
          name={displayIsPlaying ? "pause" : "play-arrow"}
          size={iconSize}
          color={colors.textPrimary}
        />
      )}
    </Pressable>
  );
}
