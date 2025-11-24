/**
 * Tab Bar Settings Screen
 *
 * Configure which tabs are shown in the tab bar vs the More menu
 */

import { translate, type TranslationKey } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useSettings } from "@/stores";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";

// Maximum tabs in the tab bar (platform-specific)
// iOS typically supports 5 tabs, Android similar
const MAX_TAB_BAR_ITEMS = Platform.select({ ios: 5, android: 5, default: 5 });

// Tab configuration with labels
// Note: "more" tab is excluded as it's always visible and always rightmost
const ALL_TABS = [
  { name: "home", titleKey: "tabs.home" as TranslationKey },
  { name: "library", titleKey: "tabs.library" as TranslationKey },
  { name: "series", titleKey: "tabs.series" as TranslationKey },
  { name: "authors", titleKey: "tabs.authors" as TranslationKey },
];

export default function TabBarSettingsScreen() {
  const { colors, isDark } = useThemedStyles();
  const { tabOrder, hiddenTabs, updateTabOrder, updateHiddenTabs } = useSettings();
  const [isUpdating, setIsUpdating] = useState(false);

  // Helper colors
  const textSecondary = isDark ? "#999999" : "#666666";
  const borderColor = isDark ? "#3A3A3C" : "#C7C7CC";
  const itemBackground = isDark ? "#1C1C1E" : "#FFFFFF";

  // Split tabs into visible (tab bar) and hidden (more menu)
  // Exclude "more" tab from both lists as it's always visible and rightmost
  const visibleTabNames = tabOrder.filter((name) => name !== "more" && !hiddenTabs.includes(name));
  const hiddenTabNames = tabOrder.filter((name) => name !== "more" && hiddenTabs.includes(name));

  const visibleTabs = visibleTabNames
    .map((name) => ALL_TABS.find((tab) => tab.name === name))
    .filter((tab): tab is (typeof ALL_TABS)[number] => tab !== undefined);

  const hiddenTabsData = hiddenTabNames
    .map((name) => ALL_TABS.find((tab) => tab.name === name))
    .filter((tab): tab is (typeof ALL_TABS)[number] => tab !== undefined);

  // Move tab up within its section (visible or hidden)
  const moveTabUp = useCallback(
    async (tabName: string, isInTabBar: boolean) => {
      if (isUpdating) return;

      const list = isInTabBar ? visibleTabNames : hiddenTabNames;
      const index = list.indexOf(tabName);
      if (index <= 0) return;

      setIsUpdating(true);
      try {
        // Swap with previous item in the section
        const newList = [...list];
        [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];

        // Reconstruct full tab order with "more" always at the end
        const newOrder = isInTabBar
          ? [...newList, ...hiddenTabNames, "more"]
          : [...visibleTabNames, ...newList, "more"];

        await updateTabOrder(newOrder);
      } catch (error) {
        console.error("Failed to update tab order", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      } finally {
        setIsUpdating(false);
      }
    },
    [visibleTabNames, hiddenTabNames, updateTabOrder, isUpdating]
  );

  // Move tab down within its section (visible or hidden)
  const moveTabDown = useCallback(
    async (tabName: string, isInTabBar: boolean) => {
      if (isUpdating) return;

      const list = isInTabBar ? visibleTabNames : hiddenTabNames;
      const index = list.indexOf(tabName);
      if (index === -1 || index >= list.length - 1) return;

      setIsUpdating(true);
      try {
        // Swap with next item in the section
        const newList = [...list];
        [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];

        // Reconstruct full tab order with "more" always at the end
        const newOrder = isInTabBar
          ? [...newList, ...hiddenTabNames, "more"]
          : [...visibleTabNames, ...newList, "more"];

        await updateTabOrder(newOrder);
      } catch (error) {
        console.error("Failed to update tab order", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      } finally {
        setIsUpdating(false);
      }
    },
    [visibleTabNames, hiddenTabNames, updateTabOrder, isUpdating]
  );

  // Move tab from More Menu to Tab Bar
  const moveToTabBar = useCallback(
    async (tabName: string) => {
      if (isUpdating) return;

      // Check if we've reached the tab bar limit
      // Note: visibleTabNames excludes "more" tab, so we add 1 to account for it
      if (visibleTabNames.length + 1 >= MAX_TAB_BAR_ITEMS) {
        Alert.alert(
          translate("settings.tabBar.limitReached.title"),
          translate("settings.tabBar.limitReached.message", {
            max: MAX_TAB_BAR_ITEMS.toString(),
          })
        );
        return;
      }

      setIsUpdating(true);
      try {
        const newHiddenTabs = hiddenTabs.filter((t) => t !== tabName);
        await updateHiddenTabs(newHiddenTabs);
      } catch (error) {
        console.error("Failed to move tab to tab bar", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      } finally {
        setIsUpdating(false);
      }
    },
    [visibleTabNames, hiddenTabs, updateHiddenTabs, isUpdating]
  );

  // Move tab from Tab Bar to More Menu
  const moveToMoreMenu = useCallback(
    async (tabName: string) => {
      if (isUpdating) return;

      // Prevent leaving tab bar with only the More tab
      // (visibleTabNames doesn't include "more" which is always present)
      if (visibleTabNames.length <= 1) {
        Alert.alert(
          translate("settings.tabBar.cannotHideAll.title"),
          translate("settings.tabBar.cannotHideAll.message")
        );
        return;
      }

      setIsUpdating(true);
      try {
        const newHiddenTabs = [...hiddenTabs, tabName];
        await updateHiddenTabs(newHiddenTabs);
      } catch (error) {
        console.error("Failed to move tab to more menu", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      } finally {
        setIsUpdating(false);
      }
    },
    [visibleTabNames, hiddenTabs, updateHiddenTabs, isUpdating]
  );

  // Reset to defaults
  const resetToDefaults = useCallback(async () => {
    Alert.alert(
      translate("settings.tabBar.reset.title"),
      translate("settings.tabBar.reset.message"),
      [
        { text: translate("common.cancel"), style: "cancel" },
        {
          text: translate("settings.tabBar.reset.confirm"),
          style: "destructive",
          onPress: async () => {
            setIsUpdating(true);
            try {
              await Promise.all([
                updateTabOrder(["home", "library", "series", "authors", "more"]),
                updateHiddenTabs([]),
              ]);
            } catch (error) {
              console.error("Failed to reset tab settings", error);
              Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  }, [updateTabOrder, updateHiddenTabs]);

  // Render a tab item with controls
  const renderTabItem = (
    tab: (typeof ALL_TABS)[number],
    index: number,
    isInTabBar: boolean,
    listLength: number
  ) => {
    const isFirst = index === 0;
    const isLast = index === listLength - 1;

    return (
      <View
        key={tab.name}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: itemBackground,
          borderRadius: 10,
          padding: 12,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: borderColor,
        }}
      >
        {/* Tab Label */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 16,
              color: colors.textPrimary,
              fontWeight: "500",
            }}
          >
            {translate(tab.titleKey)}
          </Text>
        </View>

        {/* Control Buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {/* Move Up */}
          <Pressable
            onPress={() => moveTabUp(tab.name, isInTabBar)}
            disabled={isFirst || isUpdating}
            style={{
              padding: 8,
              opacity: isFirst || isUpdating ? 0.3 : 1,
            }}
          >
            <Ionicons name="arrow-up" size={20} color={colors.textPrimary} />
          </Pressable>

          {/* Move Down */}
          <Pressable
            onPress={() => moveTabDown(tab.name, isInTabBar)}
            disabled={isLast || isUpdating}
            style={{
              padding: 8,
              opacity: isLast || isUpdating ? 0.3 : 1,
            }}
          >
            <Ionicons name="arrow-down" size={20} color={colors.textPrimary} />
          </Pressable>

          {/* Move between sections */}
          {isInTabBar ? (
            <Pressable
              onPress={() => moveToMoreMenu(tab.name)}
              disabled={isUpdating}
              style={{
                padding: 8,
                opacity: isUpdating ? 0.5 : 1,
              }}
            >
              <Ionicons name="remove-circle-outline" size={20} color="#FF3B30" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => moveToTabBar(tab.name)}
              disabled={isUpdating}
              style={{
                padding: 8,
                opacity: isUpdating ? 0.5 : 1,
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color="#34C759" />
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: translate("settings.tabBar.title") }} />

      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Description */}
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 14, color: textSecondary, lineHeight: 20 }}>
            {translate("settings.tabBar.description")}
          </Text>
        </View>

        {/* Tab Bar Section */}
        <View style={{ padding: 16, paddingTop: 8 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textSecondary,
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            {translate("settings.tabBar.sections.tabBar")} ({visibleTabs.length + 1}/
            {MAX_TAB_BAR_ITEMS})
          </Text>
          {visibleTabs.map((tab, index) => renderTabItem(tab, index, true, visibleTabs.length))}
          {/* Show More tab as always present */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: itemBackground,
              borderRadius: 10,
              padding: 12,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: borderColor,
              opacity: 0.6,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  color: colors.textPrimary,
                  fontWeight: "500",
                }}
              >
                {translate("tabs.more")}{" "}
                <Text style={{ fontSize: 14, fontStyle: "italic" }}>(always visible)</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* More Menu Section */}
        {hiddenTabsData.length > 0 && (
          <View style={{ padding: 16, paddingTop: 0 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: textSecondary,
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              {translate("settings.tabBar.sections.moreMenu")} ({hiddenTabsData.length})
            </Text>
            {hiddenTabsData.map((tab, index) =>
              renderTabItem(tab, index, false, hiddenTabsData.length)
            )}
          </View>
        )}

        {/* Reset Button */}
        <View style={{ padding: 16 }}>
          <Pressable
            onPress={resetToDefaults}
            disabled={isUpdating}
            style={{
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 10,
              padding: 16,
              borderWidth: 1,
              borderColor: borderColor,
              alignItems: "center",
              opacity: isUpdating ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                color: "#FF3B30",
                fontWeight: "600",
              }}
            >
              {translate("settings.tabBar.reset.title")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}
