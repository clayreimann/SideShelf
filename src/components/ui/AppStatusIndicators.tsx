import { OfflineIcon } from "@/components/icons";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/stores";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function shouldShowOfflineStatus(
  initialized: boolean,
  isConnected: boolean | null,
  isInternetReachable: boolean | null,
  serverReachable: boolean | null
): boolean {
  return (
    initialized && (!isConnected || isInternetReachable === false || serverReachable === false)
  );
}

export default function AppStatusIndicators() {
  const router = useRouter();
  const { authStatus } = useAuth();
  const { isConnected, isInternetReachable, serverReachable, initialized } = useNetwork();
  const { isDark, colors } = useThemedStyles();
  const insets = useSafeAreaInsets();

  const showOffline = shouldShowOfflineStatus(
    initialized,
    isConnected,
    isInternetReachable,
    serverReachable
  );
  const showReauthentication = authStatus === "reauthRequired";

  if (!showOffline && !showReauthentication) {
    return null;
  }

  const sessionBackground = isDark ? "#5C4200" : "#FFF3CD";
  const sessionText = isDark ? "#FFE08A" : "#664D03";

  return (
    <View
      testID="app-status-indicators"
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: showOffline ? colors.error : sessionBackground,
        },
      ]}
    >
      {showOffline ? (
        <View style={[styles.row, { backgroundColor: colors.error }]}>
          <OfflineIcon />
          <Text style={styles.offlineText}>
            {translate("common.offline")} - {translate("common.offline.description")}
          </Text>
        </View>
      ) : null}
      {showReauthentication ? (
        <View style={[styles.row, { backgroundColor: sessionBackground }]}>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.sessionText, { color: sessionText }]}
          >
            {translate("auth.sessionExpired")}
          </Text>
          <Pressable
            testID="reauthenticate-button"
            accessibilityRole="button"
            accessibilityLabel={translate("auth.signIn")}
            hitSlop={8}
            onPress={() => router.push({ pathname: "/login", params: { mode: "reauth" } })}
          >
            <Text style={[styles.signInText, { color: colors.link }]}>
              {translate("auth.signIn")}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  row: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
  },
  offlineText: {
    color: "white",
    fontSize: 13,
    fontWeight: "500",
  },
  sessionText: {
    fontSize: 13,
    fontWeight: "500",
  },
  signInText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
