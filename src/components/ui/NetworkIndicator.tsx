/**
 * Network Indicator Component
 *
 * Displays a banner when the device is offline or cannot reach the server.
 * Shows at the top of the screen to inform users about connection status.
 */

import { OfflineIcon } from "@/components/icons";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useNetwork } from "@/stores";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NetworkIndicator() {
  const { isConnected, isInternetReachable, serverReachable } = useNetwork();
  const { colors } = useThemedStyles();
  const insets = useSafeAreaInsets();

  // Show indicator when offline, no internet, or server unreachable
  const isOffline = !isConnected || isInternetReachable === false || serverReachable === false;

  if (!isOffline) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.error,
          paddingTop: insets.top + 6,
        },
      ]}
    >
      <OfflineIcon />
      <Text style={styles.text}>
        {translate("common.offline")} - {translate("common.offline.description")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
  },
  text: {
    color: "white",
    fontSize: 13,
    fontWeight: "500",
  },
});
