/**
 * PlaybackSpeedControl - Control for adjusting playback speed
 *
 * This component provides a MenuView to select playback speeds including:
 * - 0.5x, 0.75x, 1.0x (normal), 1.25x, 1.5x, 1.75x, 2.0x, 2.5x, 3.0x
 */

import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { usePlayer } from "@/stores/appStore";
import { MenuView } from "@react-native-menu/menu";
import React, { useCallback } from "react";
import { Text, View } from "react-native";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

export default function PlaybackSpeedControl() {
  const { styles } = useThemedStyles();
  const { playbackRate } = usePlayer();

  const handleRateChange = useCallback(async (rate: number) => {
    try {
      await playerService.setRate(rate);
    } catch (error) {
      console.error("[PlaybackSpeedControl] Failed to set playback rate:", error);
    }
  }, []);

  return (
    <View style={{ alignItems: "center" }}>
      <MenuView
        title={translate("player.playbackSpeed.title")}
        onPressAction={({ nativeEvent }) => {
          const rate = parseFloat(nativeEvent.event);
          handleRateChange(rate);
        }}
        actions={PLAYBACK_SPEEDS.map((rate) => ({
          id: rate.toString(),
          title: translate("player.playbackSpeed.rate", { rate }),
          state: playbackRate === rate ? "on" : "off",
        }))}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: "rgba(128, 128, 128, 0.2)",
          }}
        >
          <Text style={[styles.text, { fontSize: 14, fontWeight: "600" }]}>
            {translate("player.playbackSpeed.rate", { rate: playbackRate })}
          </Text>
        </View>
      </MenuView>
    </View>
  );
}
