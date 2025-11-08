/**
 * SleepTimerControl - Control for setting sleep timer
 *
 * This component provides a MenuView to set sleep timers with options:
 * - Time-based: 5, 10, 15, 30, 45, 60 minutes
 * - Chapter-based: End of current chapter, End of next chapter
 * - Turn off
 *
 * Displays remaining time when active. The actual timer checking and
 * auto-pause logic is handled by PlayerBackgroundService for reliability
 * during background playback.
 */

import { useThemedStyles } from "@/lib/theme";
import { useAppStore } from "@/stores/appStore";
import { MenuView } from "@react-native-menu/menu";
import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

const TIME_OPTIONS = [5, 10, 15, 30, 45, 60]; // minutes

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function SleepTimerControl() {
  const { styles, isDark } = useThemedStyles();
  const sleepTimer = useAppStore((state) => state.player.sleepTimer);
  const setSleepTimer = useAppStore((state) => state.setSleepTimer);
  const setSleepTimerChapter = useAppStore((state) => state.setSleepTimerChapter);
  const cancelSleepTimer = useAppStore((state) => state.cancelSleepTimer);
  const getSleepTimerRemaining = useAppStore((state) => state.getSleepTimerRemaining);

  const [remainingTime, setRemainingTime] = useState<number | null>(null);

  // Update remaining time display every second
  // Note: The actual timer expiration and auto-pause is handled by
  // PlayerBackgroundService for reliability during background playback
  useEffect(() => {
    if (!sleepTimer.type) {
      setRemainingTime(null);
      return;
    }

    const updateRemaining = () => {
      const remaining = getSleepTimerRemaining();
      setRemainingTime(remaining);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [sleepTimer, getSleepTimerRemaining]);

  const handleMenuAction = useCallback(
    (actionId: string) => {
      if (actionId === "off") {
        cancelSleepTimer();
      } else if (actionId === "end-of-chapter") {
        setSleepTimerChapter("current");
      } else if (actionId === "end-of-next-chapter") {
        setSleepTimerChapter("next");
      } else {
        const minutes = parseInt(actionId, 10);
        setSleepTimer(minutes);
      }
    },
    [setSleepTimer, setSleepTimerChapter, cancelSleepTimer]
  );

  const getDisplayText = () => {
    if (!sleepTimer.type || remainingTime === null) {
      return "Off";
    }

    if (sleepTimer.type === "chapter") {
      const target = sleepTimer.chapterTarget === "current" ? "Chapter" : "Next Chapter";
      return `${target} (${formatTime(remainingTime)})`;
    }

    return formatTime(remainingTime);
  };

  const isActive = sleepTimer.type !== null;

  return (
    <View style={{ alignItems: "center" }}>
      <MenuView
        title="Sleep Timer"
        onPressAction={({ nativeEvent }) => {
          handleMenuAction(nativeEvent.event);
        }}
        actions={[
          {
            id: "time-section",
            title: "",
            subtitle: "Timer Duration",
            attributes: { disabled: true },
          },
          ...TIME_OPTIONS.map((minutes) => ({
            id: minutes.toString(),
            title: `${minutes} minutes`,
          })),
          {
            id: "chapter-section",
            title: "",
            subtitle: "Chapter Boundary",
            attributes: { disabled: true },
          },
          {
            id: "end-of-chapter",
            title: "End of Current Chapter",
          },
          {
            id: "end-of-next-chapter",
            title: "End of Next Chapter",
          },
          {
            id: "control-section",
            title: "",
            attributes: { disabled: true },
          },
          {
            id: "off",
            title: "Turn Off",
            attributes: { destructive: true },
          },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: isActive ? "rgba(0, 122, 255, 0.2)" : "rgba(128, 128, 128, 0.2)",
          }}
        >
          <Text
            style={[
              styles.text,
              { fontSize: 14, fontWeight: "600", color: isActive ? "#007AFF" : undefined },
            ]}
          >
            {getDisplayText()}
          </Text>
        </View>
      </MenuView>
    </View>
  );
}
