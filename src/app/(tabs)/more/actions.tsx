/**
 * Actions Screen
 *
 * General diagnostic and administrative actions
 */

import { clearAllLocalCovers } from "@/db/helpers/localData";
import { useFloatingPlayerPadding } from "@/hooks/useFloatingPlayerPadding";
import { translate } from "@/i18n";
import { clearAllCoverCache } from "@/lib/covers";
import { useThemedStyles } from "@/lib/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useDb } from "@/providers/DbProvider";
import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";
import { useCallback } from "react";
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

export default function ActionsScreen() {
  const { styles, isDark } = useThemedStyles();
  const { accessToken, logout } = useAuth();
  const { resetDatabase } = useDb();
  const floatingPlayerPadding = useFloatingPlayerPadding();

  const clearCoverCache = useCallback(async () => {
    try {
      await clearAllCoverCache();
      await clearAllLocalCovers();
      console.log("Cover cache and database imageUrls cleared successfully");
    } catch (error) {
      console.error("Failed to clear cover cache:", error);
    }
  }, []);

  const sections: Section[] = [
    {
      title: translate("advanced.sections.actions"),
      data: [
        {
          label: translate("advanced.actions.copyAccessToken"),
          onPress: async () => {
            if (accessToken) {
              await Clipboard.setStringAsync(accessToken);
            }
          },
          disabled: !accessToken,
        },
        {
          label: translate("advanced.actions.resetApp"),
          onPress: async () => {
            resetDatabase();
            await clearCoverCache();
            await logout();
          },
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
      <Stack.Screen options={{ title: translate("actions.title") }} />
    </>
  );
}
