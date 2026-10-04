/**
 * Toggle Component
 *
 * Thin wrapper around React Native's Switch. Using the built-in control
 * gives us the switch accessibility role, checked-state announcement, and
 * native styling for free (previously a hand-rolled Pressable that was
 * invisible to screen readers).
 */

import { useThemedStyles } from "@/lib/theme";
import { Switch } from "react-native";

export interface ToggleProps {
  /** Whether the toggle is currently enabled */
  value: boolean;
  /** Callback when toggle is pressed */
  onValueChange: (value: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Screen-reader label describing what this toggle controls */
  accessibilityLabel: string;
}

export default function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: ToggleProps) {
  const { isDark } = useThemedStyles();
  const primaryColor = isDark ? "#4A9EFF" : "#007AFF";

  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ true: primaryColor, false: isDark ? "#3A3A3C" : "#C7C7CC" }}
    />
  );
}
