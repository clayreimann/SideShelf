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
import { GestureDetector, Gesture, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";

// Maximum tabs in the tab bar (platform-specific)
const MAX_TAB_BAR_ITEMS = Platform.select({ ios: 5, android: 5, default: 5 });

// Tab configuration with labels
// Note: "more" tab is excluded as it's always visible and always rightmost
const ALL_TABS = [
  { name: "home", titleKey: "tabs.home" as TranslationKey },
  { name: "library", titleKey: "tabs.library" as TranslationKey },
  { name: "series", titleKey: "tabs.series" as TranslationKey },
  { name: "authors", titleKey: "tabs.authors" as TranslationKey },
];

// Approximate height of each tab row: padding:12*2 + fontSize:16 + border ≈ 58
const ITEM_HEIGHT = 58;

type DraggableTabItemProps = {
  tab: (typeof ALL_TABS)[number];
  index: number;
  listLength: number;
  isInTabBar: boolean;
  isUpdating: boolean;
  colors: ReturnType<typeof useThemedStyles>["colors"];
  textSecondary: string;
  borderColor: string;
  itemBackground: string;
  onMoveSection: (tabName: string) => void;
  onReorder: (tabName: string, fromIndex: number, toIndex: number, isInTabBar: boolean) => void;
  /** Shared values owned by the parent section — all siblings read these */
  listActiveIdx: SharedValue<number>;
  listHoverIdx: SharedValue<number>;
  listDragY: SharedValue<number>;
};

function DraggableTabItem({
  tab,
  index,
  listLength,
  isInTabBar,
  isUpdating,
  colors,
  textSecondary,
  borderColor,
  itemBackground,
  onMoveSection,
  onReorder,
  listActiveIdx,
  listHoverIdx,
  listDragY,
}: DraggableTabItemProps) {
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      listActiveIdx.value = index;
      listHoverIdx.value = index;
    })
    .onUpdate((e) => {
      listDragY.value = e.translationY;
      listHoverIdx.value = Math.max(
        0,
        Math.min(listLength - 1, Math.round(index + e.translationY / ITEM_HEIGHT))
      );
    })
    .onEnd(() => {
      const from = listActiveIdx.value;
      const to = listHoverIdx.value;
      // Reset visual state immediately — the re-render from onReorder will place
      // items in their new positions before the next frame is noticeable.
      listActiveIdx.value = -1;
      listHoverIdx.value = -1;
      listDragY.value = 0;
      if (from !== to) {
        runOnJS(onReorder)(tab.name, from, to, isInTabBar);
      }
    })
    .onFinalize(() => {
      listActiveIdx.value = -1;
      listHoverIdx.value = -1;
      listDragY.value = 0;
    });

  const animatedStyle = useAnimatedStyle(() => {
    const active = listActiveIdx.value;
    const hover = listHoverIdx.value;
    const dragY = listDragY.value;

    if (active === -1) {
      return { transform: [{ translateY: 0 }], zIndex: 0, shadowOpacity: 0, elevation: 0 };
    }

    // This item is the one being dragged
    if (active === index) {
      return {
        transform: [{ translateY: dragY }],
        zIndex: 100,
        shadowOpacity: 0.2,
        elevation: 6,
      };
    }

    // Determine whether this item should slide to create a gap
    let shift = 0;
    if (active < hover) {
      // Dragging downward — items between active+1 and hover slide up
      if (index > active && index <= hover) {
        shift = -ITEM_HEIGHT;
      }
    } else if (active > hover) {
      // Dragging upward — items between hover and active-1 slide down
      if (index >= hover && index < active) {
        shift = ITEM_HEIGHT;
      }
    }

    return { transform: [{ translateY: shift }], zIndex: 0, shadowOpacity: 0, elevation: 0 };
  });

  return (
    <Animated.View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: itemBackground,
          borderRadius: 10,
          padding: 12,
          marginBottom: 8,
          borderWidth: 1,
          borderColor,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 6,
        },
        animatedStyle,
      ]}
    >
      {/* Drag handle — wrapping only the handle in GestureDetector keeps taps on the
          rest of the row (e.g. the section-move button) working independently */}
      <GestureDetector gesture={panGesture}>
        <View style={{ padding: 4, marginRight: 8 }}>
          <Ionicons name="reorder-three" size={22} color={textSecondary} />
        </View>
      </GestureDetector>

      {/* Tab Label */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: colors.textPrimary, fontWeight: "500" }}>
          {translate(tab.titleKey)}
        </Text>
      </View>

      {/* Move between sections */}
      {isInTabBar ? (
        <Pressable
          onPress={() => onMoveSection(tab.name)}
          disabled={isUpdating}
          style={{ padding: 8, opacity: isUpdating ? 0.5 : 1 }}
        >
          <Ionicons name="remove-circle-outline" size={20} color="#FF3B30" />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => onMoveSection(tab.name)}
          disabled={isUpdating}
          style={{ padding: 8, opacity: isUpdating ? 0.5 : 1 }}
        >
          <Ionicons name="add-circle-outline" size={20} color="#34C759" />
        </Pressable>
      )}
    </Animated.View>
  );
}

export default function TabBarSettingsScreen() {
  const { colors, isDark } = useThemedStyles();
  const { tabOrder, hiddenTabs, updateTabOrder, updateHiddenTabs } = useSettings();
  const [isUpdating, setIsUpdating] = useState(false);

  // Helper colors
  const textSecondary = isDark ? "#999999" : "#666666";
  const borderColor = isDark ? "#3A3A3C" : "#C7C7CC";
  const itemBackground = isDark ? "#1C1C1E" : "#FFFFFF";

  // Split tabs into visible (tab bar) and hidden (more menu)
  const visibleTabNames = tabOrder.filter((name) => name !== "more" && !hiddenTabs.includes(name));
  const hiddenTabNames = tabOrder.filter((name) => name !== "more" && hiddenTabs.includes(name));

  const visibleTabs = visibleTabNames
    .map((name) => ALL_TABS.find((tab) => tab.name === name))
    .filter((tab): tab is (typeof ALL_TABS)[number] => tab !== undefined);

  const hiddenTabsData = hiddenTabNames
    .map((name) => ALL_TABS.find((tab) => tab.name === name))
    .filter((tab): tab is (typeof ALL_TABS)[number] => tab !== undefined);

  // Shared drag state for each section — owned here so all sibling items can read them
  const visibleActiveIdx = useSharedValue(-1);
  const visibleHoverIdx = useSharedValue(-1);
  const visibleDragY = useSharedValue(0);

  const hiddenActiveIdx = useSharedValue(-1);
  const hiddenHoverIdx = useSharedValue(-1);
  const hiddenDragY = useSharedValue(0);

  // Drag-to-reorder within a section
  const reorderTab = useCallback(
    async (tabName: string, fromIndex: number, toIndex: number, isInTabBar: boolean) => {
      if (isUpdating || fromIndex === toIndex) return;
      const list = isInTabBar ? [...visibleTabNames] : [...hiddenTabNames];
      const [removed] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, removed);
      const newOrder = isInTabBar
        ? [...list, ...hiddenTabNames, "more"]
        : [...visibleTabNames, ...list, "more"];
      setIsUpdating(true);
      try {
        await updateTabOrder(newOrder);
      } catch (error) {
        console.error("Failed to reorder tab", error);
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
          {visibleTabs.map((tab, index) => (
            <DraggableTabItem
              key={tab.name}
              tab={tab}
              index={index}
              listLength={visibleTabs.length}
              isInTabBar={true}
              isUpdating={isUpdating}
              colors={colors}
              textSecondary={textSecondary}
              borderColor={borderColor}
              itemBackground={itemBackground}
              onMoveSection={moveToMoreMenu}
              onReorder={reorderTab}
              listActiveIdx={visibleActiveIdx}
              listHoverIdx={visibleHoverIdx}
              listDragY={visibleDragY}
            />
          ))}
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
              <Text style={{ fontSize: 16, color: colors.textPrimary, fontWeight: "500" }}>
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
            {hiddenTabsData.map((tab, index) => (
              <DraggableTabItem
                key={tab.name}
                tab={tab}
                index={index}
                listLength={hiddenTabsData.length}
                isInTabBar={false}
                isUpdating={isUpdating}
                colors={colors}
                textSecondary={textSecondary}
                borderColor={borderColor}
                itemBackground={itemBackground}
                onMoveSection={moveToTabBar}
                onReorder={reorderTab}
                listActiveIdx={hiddenActiveIdx}
                listHoverIdx={hiddenHoverIdx}
                listDragY={hiddenDragY}
              />
            ))}
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
            <Text style={{ fontSize: 16, color: "#FF3B30", fontWeight: "600" }}>
              {translate("settings.tabBar.reset.title")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}
