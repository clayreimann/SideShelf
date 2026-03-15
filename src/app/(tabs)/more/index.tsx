import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate, type TranslationKey } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useAppStore } from "@/stores/appStore";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as WebBrowser from "expo-web-browser";
import { type ComponentProps, useMemo } from "react";
import { Alert, FlatList, Platform, Pressable, Text, View } from "react-native";
import DeviceInfo from "react-native-device-info";
import type { SFSymbol } from "sf-symbols-typescript";

// Module-scope constant — DeviceInfo.getVersion() and getBuildNumber() are synchronous
const APP_VERSION = `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`;

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

type ActionItem = {
  label: string;
  onPress?: () => void;
  badge?: number;
  styles?: { color?: string };
  icon?: { sf: SFSymbol; ionicon: IoniconsName };
  isNavItem?: boolean;
};

// Tab configuration with labels (matching tab-bar-settings.tsx)
const ALL_TABS = [
  { name: "home", titleKey: "tabs.home" as TranslationKey },
  { name: "library", titleKey: "tabs.library" as TranslationKey },
  {
    name: "series",
    titleKey: "tabs.series" as TranslationKey,
    icon: { sf: "square.stack" as SFSymbol, ionicon: "layers-outline" as IoniconsName },
  },
  {
    name: "authors",
    titleKey: "tabs.authors" as TranslationKey,
    icon: { sf: "person.circle" as SFSymbol, ionicon: "people-circle-outline" as IoniconsName },
  },
];

export default function MoreScreen() {
  const { styles, isDark } = useThemedStyles();
  const router = useRouter();
  const { logout } = useAuth();
  const errorCount = useAppStore((state) => state.logger.errorCount);
  const errorsAcknowledgedTimestamp = useAppStore(
    (state) => state.logger.errorsAcknowledgedTimestamp
  );
  const diagnosticsEnabled = useAppStore((state) => state.settings.diagnosticsEnabled);
  const tabOrder = useAppStore((state) => state.settings.tabOrder);
  const hiddenTabs = useAppStore((state) => state.settings.hiddenTabs);
  const floatingPlayerPadding = useFloatingPlayerPadding();

  // Color for icons and chevrons — matches iOS Settings secondary icon tint
  const textSecondary = isDark ? "#8E8E93" : "#6E6E73";

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
        onPress: () =>
          tab.name === "series" ? router.push("/more/series") : router.push("/more/authors"),
        icon: tab.icon,
        isNavItem: true,
      });
    });

    // Add standard More menu items
    items.push(
      {
        label: translate("more.aboutMe"),
        onPress: () => router.push("/more/me"),
        icon: {
          sf: "person.crop.circle" as SFSymbol,
          ionicon: "person-circle-outline" as IoniconsName,
        },
        isNavItem: true,
      },
      {
        label: translate("more.settings"),
        onPress: () => router.push("/more/settings"),
        icon: { sf: "gearshape" as SFSymbol, ionicon: "settings-outline" as IoniconsName },
        isNavItem: true,
      },
      {
        label: translate("more.feedback"),
        onPress: openFeedback,
        icon: { sf: "envelope" as SFSymbol, ionicon: "mail-outline" as IoniconsName },
      }
    );

    // Conditionally add diagnostics screens
    if (diagnosticsEnabled) {
      items.push(
        {
          label: translate("more.libraryStats"),
          onPress: () => router.push("/more/library-stats"),
          icon: { sf: "chart.bar" as SFSymbol, ionicon: "bar-chart-outline" as IoniconsName },
          isNavItem: true,
        },
        {
          label: translate("more.storage"),
          onPress: () => router.push("/more/storage"),
          icon: { sf: "externaldrive" as SFSymbol, ionicon: "server-outline" as IoniconsName },
          isNavItem: true,
        },
        {
          label: translate("more.trackPlayer"),
          onPress: () => router.push("/more/track-player"),
          icon: { sf: "waveform" as SFSymbol, ionicon: "radio-outline" as IoniconsName },
          isNavItem: true,
        },
        {
          label: translate("more.traceDumps"),
          onPress: () => router.push("/more/trace-dumps"),
          icon: { sf: "doc.badge.gearshape" as SFSymbol, ionicon: "bug-outline" as IoniconsName },
          isNavItem: true,
        },
        {
          label: translate("more.logs"),
          onPress: () => router.push("/more/logs"),
          badge: showErrorBadge ? errorCount : undefined,
          icon: { sf: "doc.text" as SFSymbol, ionicon: "document-text-outline" as IoniconsName },
          isNavItem: true,
        },
        {
          label: translate("more.loggerSettings"),
          onPress: () => router.push("/more/logger-settings"),
          icon: {
            sf: "slider.horizontal.3" as SFSymbol,
            ionicon: "options-outline" as IoniconsName,
          },
          isNavItem: true,
        },
        {
          label: translate("more.actions"),
          onPress: () => router.push("/more/actions"),
          icon: { sf: "bolt" as SFSymbol, ionicon: "flash-outline" as IoniconsName },
          isNavItem: true,
        }
      );
    }

    // Add logout at the end
    items.push({
      label: translate("more.logOut"),
      styles: { color: "red" },
      icon: {
        sf: "rectangle.portrait.and.arrow.right" as SFSymbol,
        ionicon: "log-out-outline" as IoniconsName,
      },
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
        contentContainerStyle={floatingPlayerPadding}
        data={data}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.listItem, pressed && { opacity: 0.6 }]}
            onPress={item.onPress}
            android_ripple={{ color: textSecondary }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flex: 1,
              }}
            >
              {item.icon && (
                <View style={{ marginRight: 12 }}>
                  {Platform.OS === "ios" ? (
                    <SymbolView
                      name={item.icon.sf}
                      size={20}
                      tintColor={textSecondary}
                      fallback={
                        <Ionicons name={item.icon.ionicon} size={20} color={textSecondary} />
                      }
                    />
                  ) : (
                    <Ionicons name={item.icon.ionicon} size={20} color={textSecondary} />
                  )}
                </View>
              )}
              <Text style={[styles.text, { flex: 1 }, item.styles]}>{item.label}</Text>
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
              {item.isNavItem && (
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={textSecondary}
                  style={{ marginLeft: 4 }}
                />
              )}
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ paddingVertical: 16, paddingHorizontal: 16, alignItems: "center" }}>
            <Text style={[styles.text, { fontSize: 12, opacity: 0.6 }]}>
              {translate("more.version", { version: APP_VERSION })}
            </Text>
          </View>
        }
      />

      <Stack.Screen options={{ title: translate("more.title") }} />
    </>
  );
}
