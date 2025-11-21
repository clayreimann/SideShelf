import { ErrorBoundary } from "@/components/errors";
import FloatingPlayer from "@/components/ui/FloatingPlayer";
import NetworkIndicator from "@/components/ui/NetworkIndicator";
import { translate, type TranslationKey } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { DownloadService } from "@/services/DownloadService";
import { useAppStore } from "@/stores/appStore";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter, Stack } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { useEffect, useMemo } from "react";
import { Platform, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

type TabConfig = {
  name: string;
  titleKey: TranslationKey;
  sfSymbol: {
    default: SFSymbol;
    selected: SFSymbol;
  };
  androidIcon: {
    default: IoniconsName;
    selected: IoniconsName;
  };
};

const platform = Platform.OS;
const isIOS = platform === "ios";
const isAndroid = platform === "android";

const TAB_CONFIG: TabConfig[] = [
  {
    name: "home",
    titleKey: "tabs.home",
    sfSymbol: { default: "house", selected: "house.fill" },
    androidIcon: { default: "home-outline", selected: "home" },
  },
  {
    name: "library",
    titleKey: "tabs.library",
    sfSymbol: {
      default: "books.vertical",
      selected: "books.vertical.fill",
    },
    androidIcon: { default: "book-outline", selected: "book" },
  },
  {
    name: "series",
    titleKey: "tabs.series",
    sfSymbol: { default: "square.stack", selected: "square.stack.fill" },
    androidIcon: { default: "layers-outline", selected: "layers" },
  },
  {
    name: "authors",
    titleKey: "tabs.authors",
    sfSymbol: { default: "person.circle", selected: "person.circle.fill" },
    androidIcon: {
      default: "people-circle-outline",
      selected: "people-circle",
    },
  },
  {
    name: "more",
    titleKey: "tabs.more",
    sfSymbol: { default: "ellipsis.circle", selected: "ellipsis.circle.fill" },
    androidIcon: {
      default: "ellipsis-horizontal-circle-outline",
      selected: "ellipsis-horizontal-circle",
    },
  },
];

type TabBarIconProps = {
  config: TabConfig;
  focused?: boolean;
  color?: string;
  size?: number;
};

const TabBarIcon = ({ config, focused, color, size }: TabBarIconProps) => {
  if (isAndroid) {
    return (
      <Ionicons
        name={focused ? config.androidIcon.selected : config.androidIcon.default}
        size={size ?? 24}
        color={color}
      />
    );
  }

  if (isIOS) {
    return (
      <SymbolView
        name={focused ? config.sfSymbol.selected : config.sfSymbol.default}
        size={size ?? 24}
        tintColor={color}
        fallback={
          <Ionicons
            name={focused ? config.androidIcon.selected : config.androidIcon.default}
            size={size ?? 24}
            color={color}
          />
        }
      />
    );
  }

  return (
    <Ionicons
      name={focused ? config.androidIcon.selected : config.androidIcon.default}
      size={size ?? 24}
      color={color}
    />
  );
};

export default function TabLayout() {
  const router = useRouter();
  const { initialized, isAuthenticated, loginMessage } = useAuth();
  const { tabs, isDark } = useThemedStyles();
  const errorCount = useAppStore((state) => state.logger.errorCount);
  const diagnosticsEnabled = useAppStore((state) => state.settings.diagnosticsEnabled);
  const settingsInitialized = useAppStore((state) => state.settings.initialized);
  const tabOrder = useAppStore((state) => state.settings.tabOrder);
  const hiddenTabs = useAppStore((state) => state.settings.hiddenTabs);
  const showErrorBadge = errorCount > 0 && diagnosticsEnabled;

  // Get ordered and filtered tabs based on user preferences
  // Only filter tabs if settings are initialized to avoid flash of all tabs
  // Memoize to prevent infinite re-render loops
  const visibleTabs = useMemo(() => {
    if (!settingsInitialized) {
      return TAB_CONFIG; // Show all tabs while loading settings
    }
    return tabOrder
      .map((name) => TAB_CONFIG.find((tab) => tab.name === name))
      .filter((tab): tab is TabConfig => tab !== undefined && !hiddenTabs.includes(tab.name));
  }, [settingsInitialized, tabOrder, hiddenTabs]);
  useEffect(() => {
    if (initialized && !isAuthenticated) {
      router.push("/login");
    }
  }, [initialized, isAuthenticated]);
  useEffect(() => {
    DownloadService.getInstance().initialize();
  }, []);
  useEffect(() => {
    if (loginMessage) {
      console.log(`[TabIndex] Redirecting to login due to loginMessage: ${loginMessage}`);
      router.navigate("/login");
    }
  }, [loginMessage]);

  if (!tabs.useNativeTabs) {
    return (
      <View style={{ flex: 1 }}>
        <NetworkIndicator />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: tabs.selectedIconColor,
            tabBarInactiveTintColor: tabs.iconColor,
            tabBarStyle: {
              backgroundColor: tabs.backgroundColor,
              borderTopColor: tabs.borderColor,
            },
            tabBarLabelStyle: {
              color: tabs.labelColor,
            },
            tabBarBadgeStyle: {
              backgroundColor: tabs.badgeBackgroundColor,
            },
          }}
        >
          {/* Render tabs in user's preferred order */}
          {/* First render visible tabs in the correct order */}
          {visibleTabs.map((tab) => {
            const label = translate(tab.titleKey);
            const isMoreTab = tab.name === "more";
            return (
              <Tabs.Screen
                key={tab.name}
                name={tab.name}
                options={{
                  title: label,
                  tabBarBadge: isMoreTab && showErrorBadge ? errorCount : undefined,
                  tabBarBadgeStyle: {
                    color: tabs.badgeTextColor,
                    backgroundColor: tabs.badgeBackgroundColor,
                  },
                  tabBarIcon: ({ focused, color, size }) => (
                    <TabBarIcon config={tab} focused={focused} color={color} size={size} />
                  ),
                }}
              />
            );
          })}
          {/* Then render hidden tabs with href: null to prevent expo-router from showing them */}
          {TAB_CONFIG.filter((tab) => !visibleTabs.some((t) => t.name === tab.name)).map((tab) => {
            const label = translate(tab.titleKey);
            return (
              <Tabs.Screen
                key={tab.name}
                name={tab.name}
                options={{
                  title: label,
                  href: null, // Hide this tab
                  tabBarIcon: ({ focused, color, size }) => (
                    <TabBarIcon config={tab} focused={focused} color={color} size={size} />
                  ),
                }}
              />
            );
          })}
        </Tabs>
        <ErrorBoundary boundaryName="FloatingPlayer">
          <FloatingPlayer />
        </ErrorBoundary>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <NetworkIndicator />
      <NativeTabs
        blurEffect={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
        backgroundColor={tabs.backgroundColor}
        iconColor={tabs.iconColor}
        tintColor={tabs.selectedIconColor}
        labelStyle={{ color: tabs.labelColor }}
        badgeBackgroundColor={tabs.badgeBackgroundColor}
        badgeTextColor={tabs.badgeTextColor}
        shadowColor={tabs.shadowColor}
        disableTransparentOnScrollEdge={tabs.disableTransparentOnScrollEdge}
        rippleColor={tabs.rippleColor}
        indicatorColor={tabs.indicatorColor}
      >
        {visibleTabs.map((tab) => {
          const label = translate(tab.titleKey);
          const isMoreTab = tab.name === "more";
          return (
            <NativeTabs.Trigger
              key={tab.name}
              name={tab.name}
              options={{
                iconColor: tabs.iconColor,
                selectedIconColor: tabs.selectedIconColor,
                labelStyle: { color: tabs.labelColor },
                selectedLabelStyle: { color: tabs.selectedLabelColor },
                backgroundColor: tabs.backgroundColor,
                badgeValue: isMoreTab && showErrorBadge ? errorCount.toString() : "",
              }}
            >
              <Label selectedStyle={{ color: tabs.selectedLabelColor }}>{label}</Label>
              <Icon
                sf={{
                  default: tab.sfSymbol.default,
                  selected: tab.sfSymbol.selected,
                }}
                selectedColor={tabs.selectedIconColor}
              />
            </NativeTabs.Trigger>
          );
        })}
      </NativeTabs>

      <ErrorBoundary boundaryName="FloatingPlayer">
        <FloatingPlayer />
      </ErrorBoundary>
    </View>
  );
}
