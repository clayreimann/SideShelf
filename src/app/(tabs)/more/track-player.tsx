/**
 * Track Player Screen
 *
 * Displays track player state information and coordinator diagnostics for debugging
 */

import { CoordinatorDiagnostics } from "@/components/diagnostics/CoordinatorDiagnostics";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";
import type { CoordinatorMetrics, StateContext } from "@/types/coordinator";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import TrackPlayer, { State, Track } from "react-native-track-player";

type Section = {
  title: string;
  data: ActionItem[];
};

type ActionItem = {
  label: string;
  component?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
};

const disabledOnPress = () => undefined;

function getStateLabel(state: State): string {
  switch (state) {
    case State.None:
      return translate("advanced.trackPlayer.states.none");
    case State.Ready:
      return translate("advanced.trackPlayer.states.ready");
    case State.Playing:
      return translate("advanced.trackPlayer.states.playing");
    case State.Paused:
      return translate("advanced.trackPlayer.states.paused");
    case State.Stopped:
      return translate("advanced.trackPlayer.states.stopped");
    case State.Buffering:
      return translate("advanced.trackPlayer.states.buffering");
    case State.Connecting:
      return translate("advanced.trackPlayer.states.connecting");
    case State.Error:
      return translate("advanced.trackPlayer.states.error");
    default:
      return translate("advanced.trackPlayer.states.unknown");
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function TrackPlayerScreen() {
  const { styles, isDark } = useThemedStyles();
  const floatingPlayerPadding = useFloatingPlayerPadding();

  // Auto-refresh state
  const autoRefresh = true;

  // TrackPlayer state
  const [trackPlayerState, setTrackPlayerState] = useState<{
    state: string;
    queueLength: number;
    currentTrackIndex: number | null;
    currentTrack: Track | null;
    position: number;
    duration: number;
    buffered: number;
    rate: number;
    volume: number;
  }>({
    state: "Unknown",
    queueLength: 0,
    currentTrackIndex: null,
    currentTrack: null,
    position: 0,
    duration: 0,
    buffered: 0,
    rate: 1.0,
    volume: 1.0,
  });

  // Coordinator state
  const [coordinatorState, setCoordinatorState] = useState<{
    metrics: CoordinatorMetrics | null;
    context: StateContext | null;
    queueLength: number;
  }>({
    metrics: null,
    context: null,
    queueLength: 0,
  });

  const refreshTrackPlayerState = useCallback(async () => {
    try {
      const [state, queue, progress, rate, volume, activeTrackIndex] = await Promise.all([
        TrackPlayer.getPlaybackState(),
        TrackPlayer.getQueue(),
        TrackPlayer.getProgress(),
        TrackPlayer.getRate(),
        TrackPlayer.getVolume(),
        TrackPlayer.getActiveTrackIndex(),
      ]);

      const currentTrack =
        activeTrackIndex !== undefined && activeTrackIndex >= 0 ? queue[activeTrackIndex] : null;

      setTrackPlayerState({
        state: getStateLabel(state.state),
        queueLength: queue.length,
        currentTrackIndex: activeTrackIndex ?? null,
        currentTrack: currentTrack ?? null,
        position: progress.position,
        duration: progress.duration,
        buffered: progress.buffered,
        rate,
        volume,
      });
    } catch (error) {
      console.error("Failed to refresh TrackPlayer state:", error);
      setTrackPlayerState({
        state: "Error",
        queueLength: 0,
        currentTrackIndex: null,
        currentTrack: null,
        position: 0,
        duration: 0,
        buffered: 0,
        rate: 1.0,
        volume: 1.0,
      });
    }
  }, []);

  const refreshCoordinatorState = useCallback(() => {
    try {
      const coordinator = getCoordinator();
      const metrics = coordinator.getMetrics();
      const context = coordinator.getContext();
      const queue = coordinator.getEventQueue();

      setCoordinatorState({
        metrics,
        context,
        queueLength: queue.length,
      });
    } catch (error) {
      console.error("Failed to refresh Coordinator state:", error);
      setCoordinatorState({
        metrics: null,
        context: null,
        queueLength: 0,
      });
    }
  }, []);

  const refreshAllStates = useCallback(() => {
    void refreshTrackPlayerState();
    refreshCoordinatorState();
  }, [refreshTrackPlayerState, refreshCoordinatorState]);

  // Initial load
  useEffect(() => {
    refreshAllStates();
  }, [refreshAllStates]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshAllStates();
    }, 1000); // Refresh every second

    return () => clearInterval(interval);
  }, [autoRefresh, refreshAllStates]);

  const hasTrack = trackPlayerState.currentTrack !== null;

  const sections: Section[] = [
    // TrackPlayer State
    {
      title: translate("advanced.sections.trackPlayer"),
      data: [
        {
          label: translate("advanced.trackPlayer.state", { state: trackPlayerState.state }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: `${translate("advanced.trackPlayer.track")} ${
            trackPlayerState.currentTrack?.title ?? translate("advanced.trackPlayer.trackNone")
          } ${
            hasTrack
              ? ` (${trackPlayerState.currentTrack?.id ?? translate("advanced.trackPlayer.trackNone")})`
              : ""
          } (${
            trackPlayerState.currentTrackIndex !== null
              ? translate("advanced.trackPlayer.trackIndex", {
                  index: trackPlayerState.currentTrackIndex + 1,
                })
              : translate("advanced.trackPlayer.trackNone")
          } / ${trackPlayerState.queueLength})`,
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label:
            translate("advanced.trackPlayer.position") +
            `${formatDuration(trackPlayerState.position)} / ${formatDuration(trackPlayerState.duration)} (${formatDuration(trackPlayerState.buffered)}${translate("advanced.trackPlayer.buffered")})`,
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.trackPlayer.playbackRate", {
            rate: trackPlayerState.rate.toFixed(2),
          }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.trackPlayer.volume", {
            volume: (trackPlayerState.volume * 100).toFixed(0),
          }),
          onPress: disabledOnPress,
          disabled: true,
        },
      ],
    },

    // Coordinator Diagnostics
    {
      title: "PlayerStateCoordinator Diagnostics",
      data: [
        {
          component: (<CoordinatorDiagnostics autoRefresh={autoRefresh} />) as React.ReactNode,
          label: "",
          onPress: disabledOnPress,
          disabled: true,
        },
      ],
    },
  ];

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item.label + index}
        renderSectionHeader={({ section: { title } }) => (
          <View style={{ marginBottom: 12, marginTop: 20, paddingHorizontal: 16 }}>
            <Text style={{ ...styles.text, fontWeight: "bold", fontSize: 18 }}>{title}</Text>
          </View>
        )}
        renderItem={({ item }: { item: ActionItem }) => (
          <View
            style={[
              styles.listItem,
              { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
            ]}
          >
            <Pressable onPress={item.onPress} disabled={item.disabled}>
              <Text style={item.disabled ? styles.text : styles.link}>{item.label}</Text>
            </Pressable>
            {item.component && item.component}
          </View>
        )}
        contentContainerStyle={[styles.flatListContainer, floatingPlayerPadding]}
        indicatorStyle={isDark ? "white" : "black"}
        stickySectionHeadersEnabled={false}
      />
      <Stack.Screen options={{ title: translate("trackPlayer.title") }} />
    </>
  );
}
