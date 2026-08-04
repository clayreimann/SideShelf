import { useThemedStyles } from "@/lib/theme";
import { useSettings } from "@/stores";
import { OptionRow } from "@/components/ui";
import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";

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
              <OptionRow
                key={option.value}
                label={option.label}
                description={option.description}
                selected={isActive}
                onPress={() => void updateBookmarkTitleMode(option.value)}
              />
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
