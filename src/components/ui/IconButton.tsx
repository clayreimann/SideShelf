/**
 * IconButton — shared chrome for icon-only buttons.
 *
 * Owns the square hitbox, centered layout, pressed-opacity feedback, and
 * accessibility contract. accessibilityLabel is deliberately REQUIRED so an
 * unlabeled icon button is a compile error (icon-only touchables are where
 * screen-reader labels get forgotten; derived labels leak raw SF Symbol names).
 *
 * Callers pass their platform icon(s) as children — IconButton does not
 * abstract icon choice.
 */

import { ReactNode } from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";

export interface IconButtonProps {
  /** Screen-reader label describing the action (required by design) */
  accessibilityLabel: string;
  /** Optional hint describing the result of a secondary interaction (e.g. long press) */
  accessibilityHint?: string;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  /** Announce an in-progress state (maps to accessibilityState.busy) */
  busy?: boolean;
  /** Announce a toggled/active state (maps to accessibilityState.selected) */
  selected?: boolean;
  /** Square touch-target size in points */
  hitBoxSize?: number;
  /** Additional styles merged onto the Pressable */
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
}

export default function IconButton({
  accessibilityLabel,
  accessibilityHint,
  onPress,
  onLongPress,
  disabled = false,
  busy,
  selected,
  hitBoxSize = 44,
  style,
  testID,
  children,
}: IconButtonProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy, selected }}
      style={({ pressed }) => [
        {
          width: hitBoxSize,
          height: hitBoxSize,
          justifyContent: "center",
          alignItems: "center",
          opacity: pressed || disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
