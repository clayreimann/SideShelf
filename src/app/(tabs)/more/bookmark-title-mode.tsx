import { useThemedStyles } from "@/lib/theme";
import { useSettings } from "@/stores";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

type BookmarkTitleModeOption = {
  value: "auto" | "prompt";
  label: string;
  description: string;
};

const OPTIONS: BookmarkTitleModeOption[] = [
  {
    value: "auto",
    label: "Auto-create",
    description: "Use the chapter title and current timestamp without asking each time.",
  },
  {
    value: "prompt",
    label: "Always Prompt",
    description: "Open a title prompt before saving every new bookmark.",
  },
];

export default function BookmarkTitleModeScreen() {
  const { colors, isDark } = useThemedStyles();
  const { bookmarkTitleMode, updateBookmarkTitleMode } = useSettings();
  const textSecondary = isDark ? "#999999" : "#666666";

  return (
    <>
      <Stack.Screen options={{ title: "Bookmark Title Mode" }} />

      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: 16 }}>
          {OPTIONS.map((option) => {
            const isActive = bookmarkTitleMode === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => void updateBookmarkTitleMode(option.value)}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
                  borderRadius: 10,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
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
                </View>
                <Text style={{ fontSize: 13, color: textSecondary, lineHeight: 18 }}>
                  {option.description}
                </Text>
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
            Long-pressing the bookmark button in auto mode still opens a one-time custom title
            prompt.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}
