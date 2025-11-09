import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useAppStore } from "@/stores/appStore";
import DeviceInfo from "react-native-device-info";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";

type ActionItem = {
  label: string;
  onPress?: () => void;
};

export default function MoreScreen() {
  const { styles } = useThemedStyles();
  const router = useRouter();
  const { logout } = useAuth();
  const errorCount = useAppStore((state) => state.logger.errorCount);
  const errorsAcknowledgedTimestamp = useAppStore(
    (state) => state.logger.errorsAcknowledgedTimestamp
  );
  const [appVersion, setAppVersion] = useState<string>("");

  // Show badge if there are errors and they haven't been acknowledged (or new errors appeared since acknowledgment)
  const showErrorBadge = errorCount > 0 && errorsAcknowledgedTimestamp === null;

  useEffect(() => {
    // Load app version info
    const loadVersionInfo = async () => {
      try {
        const version = DeviceInfo.getVersion();
        const buildNumber = DeviceInfo.getBuildNumber();
        setAppVersion(`${version} (${buildNumber})`);
      } catch (error) {
        console.error("[MoreScreen] Failed to load version info:", error);
        setAppVersion("Unknown");
      }
    };
    loadVersionInfo();
  }, []);

  const data = useMemo(() => {
    return [
      // { label: 'Collections', onPress: () => router.push('/more/collections') },
      { label: translate("more.aboutMe"), onPress: () => router.push("/more/me") },
      { label: translate("more.settings"), onPress: () => router.push("/more/settings") },
      { label: translate("more.advanced"), onPress: () => router.push("/more/advanced") },
      {
        label: translate("more.logs"),
        onPress: () => router.push("/more/logs"),
        badge: showErrorBadge ? errorCount : undefined,
      },
      {
        label: translate("more.logOut"),
        styles: { color: "red" },
        onPress: () => {
          Alert.alert(
            translate("more.logoutConfirm.title"),
            translate("more.logoutConfirm.message"),
            [
              { text: translate("common.cancel"), style: "cancel" },
              {
                text: translate("more.logOut"),
                style: "destructive",
                onPress: () => {
                  void (async () => {
                    await logout();
                    router.replace("/login");
                  })();
                },
              },
            ]
          );
        },
      },
    ];
  }, [router, logout, showErrorBadge, errorCount]);
  return (
    <>
      <FlatList
        style={[styles.flatListContainer]}
        data={data}
        renderItem={({ item }) => (
          <Pressable style={styles.listItem} onPress={item.onPress}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flex: 1,
              }}
            >
              <Text style={[styles.text, item.styles]}>{item.label}</Text>
              {item.badge !== undefined && (
                <View
                  style={{
                    backgroundColor: "#ff3b30",
                    borderRadius: 10,
                    minWidth: 20,
                    height: 20,
                    paddingHorizontal: 6,
                    justifyContent: "center",
                    alignItems: "center",
                    marginLeft: 8,
                  }}
                >
                  <Text style={{ color: "white", fontSize: 12, fontWeight: "bold" }}>
                    {item.badge > 99 ? "99+" : item.badge}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          appVersion ? (
            <View style={{ paddingVertical: 16, paddingHorizontal: 16, alignItems: "center" }}>
              <Text style={[styles.text, { fontSize: 12, opacity: 0.6 }]}>
                {translate("more.version", { version: appVersion })}
              </Text>
            </View>
          ) : null
        }
      />

      <Stack.Screen options={{ title: translate("more.title") }} />
    </>
  );
}
