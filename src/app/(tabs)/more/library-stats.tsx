/**
 * Library Stats Screen
 *
 * Displays library content statistics including counts for authors, genres,
 * languages, narrators, series, and tags
 */

import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useLibrary, useStatistics } from "@/stores";
import { Stack } from "expo-router";
import { useCallback, useEffect } from "react";
import { Pressable, SectionList, Text, View } from "react-native";

type Section = {
  title: string;
  data: ActionItem[];
};

type ActionItem = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

const disabledOnPress = () => undefined;

export default function LibraryStatsScreen() {
  const { styles, isDark } = useThemedStyles();
  const { refresh, selectedLibrary, libraries } = useLibrary();
  const { counts, refreshStatistics } = useStatistics();
  const floatingPlayerPadding = useFloatingPlayerPadding();

  const refreshCounts = useCallback(async () => {
    try {
      await refreshStatistics();
    } catch (error) {
      console.error("Failed to fetch counts:", error);
    }
  }, [refreshStatistics]);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  const sections: Section[] = [
    {
      title: translate("advanced.sections.libraryStats"),
      data: [
        {
          label: translate("advanced.stats.librariesFound", { count: libraries.length }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.selectedLibrary", {
            name: selectedLibrary?.name ?? translate("advanced.stats.selectedLibraryNone"),
          }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.authors", { count: counts.authors }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.genres", { count: counts.genres }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.languages", { count: counts.languages }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.narrators", { count: counts.narrators }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.series", { count: counts.series }),
          onPress: disabledOnPress,
          disabled: true,
        },
        {
          label: translate("advanced.stats.tags", { count: counts.tags }),
          onPress: disabledOnPress,
          disabled: true,
        },
      ],
    },
    {
      title: translate("advanced.sections.actions"),
      data: [
        {
          label: translate("advanced.actions.refreshLibraries"),
          onPress: refresh,
          disabled: false,
        },
        {
          label: translate("advanced.actions.refreshStats"),
          onPress: refreshCounts,
          disabled: false,
        },
      ],
    },
  ];

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item.label + index}
        renderSectionHeader={({ section: { title } }) => (
          <View style={{ marginBottom: 12, marginTop: 20, paddingHorizontal: 16 }}>
            <Text style={{ ...styles.text, fontWeight: "bold", fontSize: 18 }}>{title}</Text>
          </View>
        )}
        renderItem={({ item }: { item: ActionItem }) => (
          <View style={styles.listItem}>
            <Pressable onPress={item.onPress} disabled={item.disabled}>
              <Text style={item.disabled ? styles.text : styles.link}>{item.label}</Text>
            </Pressable>
          </View>
        )}
        contentContainerStyle={[styles.flatListContainer, floatingPlayerPadding]}
        indicatorStyle={isDark ? "white" : "black"}
        stickySectionHeadersEnabled={false}
      />
      <Stack.Screen options={{ title: translate("libraryStats.title") }} />
    </>
  );
}
