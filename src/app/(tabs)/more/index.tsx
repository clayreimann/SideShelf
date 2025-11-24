import { translate, type TranslationKey } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useAppStore } from "@/stores/appStore";
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import DeviceInfo from "react-native-device-info";

type ActionItem = {
  label: string;
  onPress?: () => void;
  badge?: number;
  styles?: { color?: string };
};

// Tab configuration with labels (matching tab-bar-settings.tsx)
const ALL_TABS = [
  { name: "home", titleKey: "tabs.home" as TranslationKey },
  { name: "library", titleKey: "tabs.library" as TranslationKey },
  { name: "series", titleKey: "tabs.series" as TranslationKey },
  { name: "authors", titleKey: "tabs.authors" as TranslationKey },
];

export default function MoreScreen() {
  const { styles } = useThemedStyles();
  const router = useRouter();
  const { logout } = useAuth();
  const errorCount = useAppStore((state) => state.logger.errorCount);
  const errorsAcknowledgedTimestamp = useAppStore(
    (state) => state.logger.errorsAcknowledgedTimestamp
  );
  const diagnosticsEnabled = useAppStore((state) => state.settings.diagnosticsEnabled);
  const tabOrder = useAppStore((state) => state.settings.tabOrder);
  const hiddenTabs = useAppStore((state) => state.settings.hiddenTabs);
  const [appVersion, setAppVersion] = useState<string>("");

  // Show badge if there are errors and they haven't been acknowledged (or new errors appeared since acknowledgment)
  // Badge only shows when diagnostics is enabled
  const showErrorBadge =
    errorCount > 0 && errorsAcknowledgedTimestamp === null && diagnosticsEnabled;

  // Get hidden tabs in the correct order
  const hiddenTabsData = useMemo(() => {
    return tabOrder
      .filter((tabName) => hiddenTabs.includes(tabName))
      .map((tabName) => ALL_TABS.find((tab) => tab.name === tabName))
      .filter((tab): tab is (typeof ALL_TABS)[number] => tab !== undefined);
  }, [tabOrder, hiddenTabs]);

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

  const openFeedback = () => {
    Alert.alert(translate("more.feedback"), translate("more.feedbackPrompt"), [
      {
        text: translate("more.bugReport"),
        onPress: () => openBugReport(),
      },
      {
        text: translate("more.featureRequest"),
        onPress: () => openFeatureRequest(),
      },
      {
        text: translate("common.cancel"),
        style: "cancel",
      },
    ]);
  };

  const openBugReport = async () => {
    try {
      const version = DeviceInfo.getVersion();
      const buildNumber = DeviceInfo.getBuildNumber();
      const systemVersion = DeviceInfo.getSystemVersion();
      const deviceId = DeviceInfo.getDeviceId();
      const brand = await DeviceInfo.getBrand();
      const model = await DeviceInfo.getModel();

      // Determine platform
      const platform = DeviceInfo.isTablet()
        ? `${DeviceInfo.getSystemName()} (Tablet)`
        : DeviceInfo.getSystemName();

      // Build device description
      const device = `${brand} ${model}`;

      // Build the bug report URL with pre-filled fields
      const params = new URLSearchParams({
        template: "bug_report.yml",
        version: `${version} (${buildNumber})`,
        platform: platform,
        "os-version": `${DeviceInfo.getSystemName()} ${systemVersion}`,
        device: device,
      });

      const url = `https://github.com/clayreimann/SideShelf/issues/new?${params.toString()}`;
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error("[MoreScreen] Failed to open bug report:", error);
    }
  };

  const openFeatureRequest = async () => {
    try {
      const version = DeviceInfo.getVersion();
      const buildNumber = DeviceInfo.getBuildNumber();

      // Build the feature request URL with pre-filled version
      const params = new URLSearchParams({
        template: "feature_request.yml",
        version: `${version} (${buildNumber})`,
      });

      const url = `https://github.com/clayreimann/SideShelf/issues/new?${params.toString()}`;
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error("[MoreScreen] Failed to open feature request:", error);
    }
  };

  const data = useMemo(() => {
    const items: ActionItem[] = [];

    // Add hidden tabs as navigation items
    hiddenTabsData.forEach((tab) => {
      items.push({
        label: translate(tab.titleKey),
        onPress: () => router.push(`/${tab.name}`),
      });
    });

    // Add standard More menu items
    items.push(
      { label: translate("more.aboutMe"), onPress: () => router.push("/more/me") },
      { label: translate("more.settings"), onPress: () => router.push("/more/settings") },
      { label: translate("more.feedback"), onPress: openFeedback }
    );

    // Conditionally add diagnostics screens
    if (diagnosticsEnabled) {
      items.push(
        {
          label: translate("more.libraryStats"),
          onPress: () => router.push("/more/library-stats"),
        },
        { label: translate("more.storage"), onPress: () => router.push("/more/storage") },
        { label: translate("more.trackPlayer"), onPress: () => router.push("/more/track-player") },
        {
          label: translate("more.logs"),
          onPress: () => router.push("/more/logs"),
          badge: showErrorBadge ? errorCount : undefined,
        },
        {
          label: translate("more.loggerSettings"),
          onPress: () => router.push("/more/logger-settings"),
        },
        { label: translate("more.actions"), onPress: () => router.push("/more/actions") }
      );
    }

    // Add logout at the end
    items.push({
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
    });

    return items;
  }, [
    router,
    logout,
    showErrorBadge,
    errorCount,
    diagnosticsEnabled,
    openFeedback,
    hiddenTabsData,
  ]);
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
