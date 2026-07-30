/**
 * PlayerProgressToast - Foreground-aware summary of a pending jump-history entry
 *
 * Appears while the app is active for seven seconds after a persisted jump is
 * restored or updated. Dismissing the toast acknowledges the entry without
 * removing it from the jump ledger.
 */

import { translate } from "@/i18n";
import { formatTime } from "@/lib/helpers/formatters";
import { getPendingJump } from "@/lib/helpers/jumpHistory";
import { useThemedStyles } from "@/lib/theme";
import { useAppStore } from "@/stores/appStore";
import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";

const TOAST_DURATION_MS = 7_000;

export default function PlayerProgressToast() {
  const { isDark } = useThemedStyles();
  const router = useRouter();
  const pathname = usePathname();
  const jumpHistory = useAppStore((state) => state.player.jumpHistory);
  const restoreJumpHistory = useAppStore((state) => state.restoreJumpHistory);
  const _dismissJumpToast = useAppStore((state) => state._dismissJumpToast);
  const setJumpHistoryModalVisible = useAppStore((state) => state.setJumpHistoryModalVisible);
  const pendingJump = getPendingJump(jumpHistory);
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === "active");

  useEffect(() => {
    let isMounted = true;
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active") {
        if (isMounted) {
          setIsAppActive(false);
        }
        return;
      }

      await restoreJumpHistory();
      if (isMounted) {
        setIsAppActive(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [restoreJumpHistory]);

  useEffect(() => {
    if (!pendingJump || !isAppActive) {
      return;
    }

    const timer = setTimeout(_dismissJumpToast, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isAppActive, pendingJump, pendingJump?.updatedAt, _dismissJumpToast]);

  const handleViewHistory = useCallback(() => {
    setJumpHistoryModalVisible(true);
    if (pathname !== "/FullScreenPlayer") {
      router.push("/FullScreenPlayer");
    }
  }, [pathname, router, setJumpHistoryModalVisible]);

  const handleDismiss = useCallback(() => {
    _dismissJumpToast();
  }, [_dismissJumpToast]);

  if (!pendingJump) return null;

  const { fromPosition, toPosition } = pendingJump;
  const delta = toPosition - fromPosition;
  const deltaLabel = delta >= 0 ? `+${formatTime(delta)}` : `-${formatTime(Math.abs(delta))}`;
  const toastBg = isDark ? "rgba(0,0,0,0.88)" : "rgba(20,20,20,0.92)";

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={[styles.toast, { backgroundColor: toastBg }]}>
        <View style={styles.content} accessibilityLiveRegion="polite">
          <Text style={styles.label}>
            {translate("player.progressToast.label", {
              time: formatTime(toPosition),
              delta: deltaLabel,
            })}
          </Text>
        </View>
        <Pressable
          onPress={handleViewHistory}
          style={styles.actionButton}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.actionLabel}>{translate("player.jumpHistory.view")}</Text>
        </Pressable>
        <Pressable
          onPress={handleDismiss}
          style={styles.dismissButton}
          hitSlop={8}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={translate("accessibility.dismiss")}
        >
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
  actionButton: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
  },
  actionLabel: {
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
