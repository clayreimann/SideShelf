/**
 * Tab Bar Settings Screen
 *
 * Configure which tabs are shown/hidden and their order
 */

import { translate, type TranslationKey } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useSettings } from "@/stores";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

// Tab configuration with labels
const ALL_TABS = [
  { name: "home", titleKey: "tabs.home" as TranslationKey },
  { name: "library", titleKey: "tabs.library" as TranslationKey },
  { name: "series", titleKey: "tabs.series" as TranslationKey },
  { name: "authors", titleKey: "tabs.authors" as TranslationKey },
  { name: "more", titleKey: "tabs.more" as TranslationKey },
];

export default function TabBarSettingsScreen() {
  const { colors, isDark } = useThemedStyles();
  const { tabOrder, hiddenTabs, updateTabOrder, updateHiddenTabs } = useSettings();
  const [isUpdating, setIsUpdating] = useState(false);

  // Helper colors
  const textSecondary = isDark ? "#999999" : "#666666";
  const borderColor = isDark ? "#3A3A3C" : "#C7C7CC";
  const itemBackground = isDark ? "#1C1C1E" : "#FFFFFF";

  // Get ordered tabs based on user preferences
  const orderedTabs = tabOrder
    .map((name) => ALL_TABS.find((tab) => tab.name === name))
    .filter((tab): tab is (typeof ALL_TABS)[number] => tab !== undefined);

  // Move tab up in order
  const moveTabUp = useCallback(
    async (index: number) => {
      if (index === 0 || isUpdating) return;

      setIsUpdating(true);
      try {
        const newOrder = [...tabOrder];
        [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
        await updateTabOrder(newOrder);
      } catch (error) {
        console.error("Failed to update tab order", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      } finally {
        setIsUpdating(false);
      }
    },
    [tabOrder, updateTabOrder, isUpdating]
  );

  // Move tab down in order
  const moveTabDown = useCallback(
    async (index: number) => {
      if (index === tabOrder.length - 1 || isUpdating) return;

      setIsUpdating(true);
      try {
        const newOrder = [...tabOrder];
        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
        await updateTabOrder(newOrder);
      } catch (error) {
        console.error("Failed to update tab order", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      } finally {
        setIsUpdating(false);
      }
    },
    [tabOrder, updateTabOrder, isUpdating]
  );

  // Toggle tab visibility
  const toggleTabVisibility = useCallback(
    async (tabName: string) => {
      if (isUpdating) return;

      // Prevent hiding all tabs or the "More" tab (which contains settings)
      const visibleTabs = tabOrder.filter((t) => !hiddenTabs.includes(t));
      if (visibleTabs.length === 1 && visibleTabs[0] === tabName) {
        Alert.alert(
          translate("settings.tabBar.cannotHideAll.title"),
          translate("settings.tabBar.cannotHideAll.message")
        );
        return;
      }

      if (tabName === "more") {
        Alert.alert(
          translate("settings.tabBar.cannotHideMore.title"),
          translate("settings.tabBar.cannotHideMore.message")
        );
        return;
      }

      setIsUpdating(true);
      try {
        const isHidden = hiddenTabs.includes(tabName);
        const newHiddenTabs = isHidden
          ? hiddenTabs.filter((t) => t !== tabName)
          : [...hiddenTabs, tabName];
        await updateHiddenTabs(newHiddenTabs);
      } catch (error) {
        console.error("Failed to update hidden tabs", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      } finally {
        setIsUpdating(false);
      }
    },
    [hiddenTabs, tabOrder, updateHiddenTabs, isUpdating]
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

        {/* Tab List */}
        <View style={{ padding: 16, paddingTop: 8 }}>
          {orderedTabs.map((tab, index) => {
            const isHidden = hiddenTabs.includes(tab.name);
            const isFirst = index === 0;
            const isLast = index === orderedTabs.length - 1;

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
                  opacity: isHidden ? 0.5 : 1,
                }}
              >
                {/* Tab Label */}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      color: colors.textPrimary,
                      fontWeight: "500",
                      textDecorationLine: isHidden ? "line-through" : "none",
                    }}
                  >
                    {translate(tab.titleKey)}
                  </Text>
                </View>

                {/* Reorder Buttons */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {/* Move Up */}
                  <Pressable
                    onPress={() => moveTabUp(index)}
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
                    onPress={() => moveTabDown(index)}
                    disabled={isLast || isUpdating}
                    style={{
                      padding: 8,
                      opacity: isLast || isUpdating ? 0.3 : 1,
                    }}
                  >
                    <Ionicons name="arrow-down" size={20} color={colors.textPrimary} />
                  </Pressable>

                  {/* Toggle Visibility */}
                  <Pressable
                    onPress={() => toggleTabVisibility(tab.name)}
                    disabled={isUpdating}
                    style={{
                      padding: 8,
                      opacity: isUpdating ? 0.5 : 1,
                    }}
                  >
                    <Ionicons
                      name={isHidden ? "eye-off" : "eye"}
                      size={20}
                      color={colors.textPrimary}
                    />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

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
