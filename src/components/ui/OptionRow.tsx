/**
 * OptionRow — a selectable option row for settings-style pickers.
 *
 * Owns both the visual selection indicator (checkmark) and the screen-reader
 * selection announcement (accessibilityState.selected), driven by the same
 * `selected` prop — so the two can never drift apart. The row is collapsed
 * into a single accessibility element labeled from label + description.
 */

import { useThemedStyles } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

export interface OptionRowProps {
  /** Visible title; also the screen-reader label */
  label: string;
  /** Optional supporting copy rendered under the title and appended to the screen-reader label */
  description?: string;
  /** Whether this option is the current selection — drives checkmark AND announcement */
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

export default function OptionRow({
  label,
  description,
  selected,
  onPress,
  testID,
}: OptionRowProps) {
  const { colors, isDark } = useThemedStyles();
  const textSecondary = isDark ? "#999999" : "#666666";

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ selected }}
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
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: description ? 4 : 0,
        }}
      >
        <Text
          style={{
            fontSize: 15,
            color: colors.textPrimary,
            fontWeight: "500",
          }}
        >
          {label}
        </Text>
        {selected && (
          <Ionicons
            testID="option-row-checkmark"
            name="checkmark"
            size={20}
            color={isDark ? "#4A9EFF" : "#007AFF"}
          />
        )}
      </View>
      {description ? (
        <Text style={{ fontSize: 13, color: textSecondary, lineHeight: 18 }}>{description}</Text>
      ) : null}
    </Pressable>
  );
}
