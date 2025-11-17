import { Platform, StyleSheet, useColorScheme } from "react-native";

const platform = Platform.OS;
const rawPlatformVersion = Platform.Version;
const parsedMajorVersion =
  typeof rawPlatformVersion === "string" ? parseInt(rawPlatformVersion, 10) : rawPlatformVersion;

const isIOS = platform === "ios";
const isAndroid = platform === "android";
const iosMajorVersion =
  isIOS && typeof parsedMajorVersion === "number" && !Number.isNaN(parsedMajorVersion)
    ? parsedMajorVersion
    : null;
const SHOULD_USE_NATIVE_TABS = iosMajorVersion !== null && iosMajorVersion >= 26;

export type ThemedStyles = ReturnType<typeof createThemedStyles>;

export function useThemedStyles() {
  const colorScheme = useColorScheme();
  return createThemedStyles(colorScheme === "dark");
}

function createThemedStyles(isDark: boolean) {
  const colors = {
    background: isDark ? "#222" : "#ffffff",
    coverBackground: isDark ? "#222" : "#eee",
    textPrimary: isDark ? "#ffffff" : "#000000",
    textSecondary: isDark ? "#aaaaaa" : "#666666",
    separator: isDark ? "rgba(255,255,255,0.15)" : "#ccc",
    link: isDark ? "#9CDCFE" : "#0066CC",
    headerBackground: isDark ? "#333" : "#ffffff",
    headerText: isDark ? "#ffffff" : "#000000",
    headerBorder: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
    error: isDark ? "#ff6b6b" : "#dc2626",
  } as const;

  const tabs = {
    useNativeTabs: SHOULD_USE_NATIVE_TABS,
    tabBarSpace: SHOULD_USE_NATIVE_TABS ? 84 : 0,
    backgroundColor: isDark ? "#1C1C1E" : "#F8F8F8",
    borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    iconColor: isDark ? "rgba(255,255,255,0.65)" : "#6A6A6A",
    selectedIconColor: colors.textPrimary,
    labelColor: isDark ? "rgba(255,255,255,0.7)" : "#6A6A6A",
    selectedLabelColor: colors.textPrimary,
    badgeTextColor: "white",
    badgeBackgroundColor: "red",
    selectedBadgeBackgroundColor: "red",
    rippleColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)",
    indicatorColor: colors.textPrimary,
    shadowColor: isDark ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.1)",
    disableTransparentOnScrollEdge: true,
  } as const;

  const header = {
    backgroundColor: colors.headerBackground,
    titleColor: colors.headerText,
    tintColor: colors.headerText,
    borderBottomColor: colors.headerBorder,
    borderBottomWidth: isDark ? 0.5 : 1,
  } as const;

  return {
    isDark,
    colors,
    tabs,
    header,
    styles: StyleSheet.create({
      flatListContainer: {
        backgroundColor: colors.background,
        width: "100%",
      },
      container: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: "center",
        alignItems: "center",
      },
      text: {
        color: colors.textPrimary,
      },
      listItem: {
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
        width: "100%",
      },
      link: {
        color: colors.link,
        textDecorationLine: "underline",
      },
    }),
  };
}
