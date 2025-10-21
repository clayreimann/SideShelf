import FloatingPlayer from "@/components/ui/FloatingPlayer";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { DownloadService } from "@/services/DownloadService";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

type TabConfig = {
  name: string;
  title: string;
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
    title: "Home",
    sfSymbol: { default: "house", selected: "house.fill" },
    androidIcon: { default: "home-outline", selected: "home" },
  },
  {
    name: "library",
    title: "Library",
    sfSymbol: {
      default: "books.vertical",
      selected: "books.vertical.fill",
    },
    androidIcon: { default: "book-outline", selected: "book" },
  },
  {
    name: "series",
    title: "Series",
    sfSymbol: { default: "square.stack", selected: "square.stack.fill" },
    androidIcon: { default: "layers-outline", selected: "layers" },
  },
  {
    name: "authors",
    title: "Authors",
    sfSymbol: { default: "person.circle", selected: "person.circle.fill" },
    androidIcon: {
      default: "people-circle-outline",
      selected: "people-circle",
    },
  },
  {
    name: "more",
    title: "More",
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
        name={
          focused ? config.androidIcon.selected : config.androidIcon.default
        }
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
            name={
              focused ? config.androidIcon.selected : config.androidIcon.default
            }
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
      console.log(
        `[TabIndex] Redirecting to login due to loginMessage: ${loginMessage}`
      );
      router.navigate("/login");
    }
  }, [loginMessage]);

  if (!tabs.useNativeTabs) {
    return (
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
          }}
        >
          {TAB_CONFIG.map((tab) => (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                title: tab.title,
                tabBarIcon: ({ focused, color, size }) => (
                  <TabBarIcon
                    config={tab}
                    focused={focused}
                    color={color}
                    size={size}
                  />
                ),
              }}
            />
          ))}
        </Tabs>
        <FloatingPlayer />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <NativeTabs
        blurEffect={
          isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"
        }
        iconColor={tabs.iconColor}
        labelStyle={{ color: tabs.labelColor }}
        badgeTextColor={tabs.badgeTextColor}
      >
        {TAB_CONFIG.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name}>
            <Label>{tab.title}</Label>
            <Icon
              sf={{
                default: tab.sfSymbol.default,
                selected: tab.sfSymbol.selected,
              }}
            />
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>

      <FloatingPlayer />
    </View>
  );
}
