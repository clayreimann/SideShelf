/**
 * PlayerProgressToast - Cancellable toast for unintentional progress jumps
 *
 * Appears when NATIVE_PROGRESS_UPDATED detects a position jump ≥30s (not during seek/load).
 * Provides an Undo button to seek back to the pre-jump position.
 * Auto-dismisses after 7 seconds.
 */

import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { playerService } from "@/services/PlayerService";
import { useAppStore } from "@/stores/appStore";
import React, { useCallback, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const log = logger.forTag("PlayerProgressToast");

export default function PlayerProgressToast() {
  const pendingProgressJump = useAppStore((state) => state.player.pendingProgressJump);
  const _setPendingProgressJump = useAppStore((state) => state._setPendingProgressJump);

  // Auto-dismiss after 7 seconds
  useEffect(() => {
    if (!pendingProgressJump) return;
    const timer = setTimeout(() => {
      _setPendingProgressJump(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [pendingProgressJump, _setPendingProgressJump]);

  const handleUndo = useCallback(async () => {
    if (!pendingProgressJump) return;
    const { fromPosition } = pendingProgressJump;
    _setPendingProgressJump(null);
    try {
      await playerService.seekTo(fromPosition);
    } catch (err) {
      log.error("[handleUndo] Failed to seek back", err);
    }
  }, [pendingProgressJump, _setPendingProgressJump]);

  const handleDismiss = useCallback(() => {
    _setPendingProgressJump(null);
  }, [_setPendingProgressJump]);

  if (!pendingProgressJump) return null;

  const { fromPosition, toPosition } = pendingProgressJump;
  const delta = toPosition - fromPosition;
  const deltaLabel = delta >= 0 ? `+${formatTime(delta)}` : `-${formatTime(Math.abs(delta))}`;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.toast}>
        <View style={styles.content}>
          <Text style={styles.label}>
            Jumped to {formatTime(toPosition)} ({deltaLabel})
          </Text>
        </View>
        <Pressable onPress={handleUndo} style={styles.undoButton} hitSlop={8}>
          <Text style={styles.undoLabel}>Undo</Text>
        </Pressable>
        <Pressable onPress={handleDismiss} style={styles.dismissButton} hitSlop={8}>
          <Text style={styles.dismissLabel}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100,
    left: 16,
    right: 16,
    alignItems: "stretch",
    zIndex: 9999,
  },
  toast: {
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  label: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  undoButton: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
  },
  undoLabel: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  dismissButton: {
    marginLeft: 8,
    padding: 4,
  },
  dismissLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
  },
});
