/**
 * Track Player Screen
 *
 * Displays track player state information for debugging
 */

import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
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

  useEffect(() => {
    void refreshTrackPlayerState();
  }, [refreshTrackPlayerState]);

  const hasTrack = trackPlayerState.currentTrack !== null;

  const sections: Section[] = [
    {
      title: translate("advanced.sections.trackPlayer"),
      data: [
        {
          label: translate("advanced.trackPlayer.state", { state: trackPlayerState.state }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.trackPlayer.queueLength", {
            length: trackPlayerState.queueLength,
          }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label:
            translate("advanced.trackPlayer.currentTrack") +
            (trackPlayerState.currentTrackIndex !== null
              ? translate("advanced.trackPlayer.trackIndex", {
                  index: trackPlayerState.currentTrackIndex,
                })
              : translate("advanced.trackPlayer.trackNone")),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label:
            translate("advanced.trackPlayer.track") +
            (trackPlayerState.currentTrack?.title ?? translate("advanced.trackPlayer.trackNone")) +
            (hasTrack
              ? ` (${trackPlayerState.currentTrack?.id ?? translate("advanced.trackPlayer.trackNone")})`
              : ""),
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
    {
      title: translate("advanced.sections.actions"),
      data: [
        {
          label: translate("advanced.actions.refreshStats"),
          onPress: refreshTrackPlayerState,
          disabled: false,
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
          <View style={styles.listItem}>
            <Pressable onPress={item.onPress} disabled={item.disabled}>
              <Text style={item.disabled ? styles.text : styles.link}>{item.label}</Text>
            </Pressable>
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
