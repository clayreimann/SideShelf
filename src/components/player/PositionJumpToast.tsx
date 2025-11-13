/**
 * PositionJumpToast - Toast notification for position jumps with undo option
 *
 * Displays when playback position jumps significantly (>30s) due to
 * multi-device reconciliation. Provides an undo button to restore the
 * previous position.
 */

import { translate } from "@/i18n";
import { formatTime } from "@/lib/helpers/formatters";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { useAppStore } from "@/stores/appStore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

const TOAST_DURATION = 10000; // 10 seconds
const ANIMATION_DURATION = 300; // Animation duration in ms

export default function PositionJumpToast() {
  const { styles, isDark } = useThemedStyles();
  const undoPositionJump = useAppStore((state) => state.player.undoPositionJump);
  const canUndoPositionJump = useAppStore((state) => state.canUndoPositionJump);
  const clearUndoPositionJump = useAppStore((state) => state.clearUndoPositionJump);

  const [isVisible, setIsVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(100)).current; // Start below screen

  // Show/hide toast based on undo availability
  useEffect(() => {
    const canUndo = canUndoPositionJump();

    if (canUndo && undoPositionJump.previousPosition !== null) {
      setIsVisible(true);

      // Slide in animation
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();

      // Auto-hide after duration
      const timeout = setTimeout(() => {
        handleDismiss();
      }, TOAST_DURATION);

      return () => {
        clearTimeout(timeout);
      };
    } else if (isVisible) {
      // Fade out if no longer available
      handleDismiss();
    }
  }, [undoPositionJump, canUndoPositionJump]);

  const handleDismiss = useCallback(() => {
    // Slide out animation
    Animated.timing(slideAnim, {
      toValue: 100,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    }).start(() => {
      setIsVisible(false);
      clearUndoPositionJump();
    });
  }, [slideAnim, clearUndoPositionJump]);

  const handleUndo = useCallback(async () => {
    if (undoPositionJump.previousPosition === null) {
      return;
    }

    try {
      // Seek back to previous position
      await playerService.seekTo(undoPositionJump.previousPosition);

      // TODO: If previousSessionId is set, we could potentially restore that session
      // For now, just seeking is sufficient as a new session will be created

      handleDismiss();
    } catch (error) {
      console.error("Failed to undo position jump:", error);
      handleDismiss();
    }
  }, [undoPositionJump, handleDismiss]);

  if (!isVisible || undoPositionJump.previousPosition === null) {
    return null;
  }

  return (
    <Animated.View
      style={[
        localStyles.container,
        {
          backgroundColor: isDark ? "#333" : "#fff",
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={localStyles.content}>
        <Text style={[localStyles.message, { color: isDark ? "#fff" : "#000" }]}>
          {translate("player.position_jumped_to")} {formatTime(undoPositionJump.previousPosition)}
        </Text>

        <View style={localStyles.actions}>
          <Pressable
            onPress={handleUndo}
            style={[
              localStyles.button,
              localStyles.undoButton,
              { backgroundColor: isDark ? "#007AFF" : "#007AFF" },
            ]}
          >
            <Text style={localStyles.buttonText}>{translate("common.undo")}</Text>
          </Pressable>

          <Pressable
            onPress={handleDismiss}
            style={[
              localStyles.button,
              localStyles.dismissButton,
              { backgroundColor: isDark ? "#555" : "#e0e0e0" },
            ]}
          >
            <Text style={[localStyles.buttonText, { color: isDark ? "#fff" : "#000" }]}>
              {translate("common.dismiss")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    gap: 12,
  },
  message: {
    fontSize: 15,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  undoButton: {
    // Blue accent
  },
  dismissButton: {
    // Gray
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
