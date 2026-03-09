/**
 * Progress Format Settings Screen
 *
 * Allows users to select how playback progress is displayed across all player surfaces.
 * Three options: Time Remaining, Elapsed / Total, % Complete
 */

import { useThemedStyles } from "@/lib/theme";
import { useSettings } from "@/stores";
import type { ProgressFormat } from "@/lib/helpers/progressFormat";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

type FormatOption = {
  value: ProgressFormat;
  label: string;
};

const FORMAT_OPTIONS: FormatOption[] = [
  { value: "remaining", label: "Time Remaining" },
  { value: "elapsed", label: "Elapsed / Total" },
  { value: "percent", label: "% Complete" },
];

export default function ProgressFormatScreen() {
  const { colors, isDark } = useThemedStyles();
  const { progressFormat, updateProgressFormat } = useSettings();

  const textSecondary = isDark ? "#999999" : "#666666";

  return (
    <>
      <Stack.Screen options={{ title: "Progress Format" }} />

      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: 16 }}>
          {FORMAT_OPTIONS.map((option) => {
            const isActive = progressFormat === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => updateProgressFormat(option.value)}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
                  borderRadius: 10,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    color: colors.textPrimary,
                    fontWeight: "500",
                  }}
                >
                  {option.label}
                </Text>
                {isActive && (
                  <Ionicons name="checkmark" size={20} color={isDark ? "#4A9EFF" : "#007AFF"} />
                )}
              </Pressable>
            );
          })}

          <Text
            style={{
              fontSize: 13,
              color: textSecondary,
              marginTop: 8,
              paddingHorizontal: 4,
              lineHeight: 18,
            }}
          >
            Controls how playback progress is shown on the player and in the floating mini-player.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}
