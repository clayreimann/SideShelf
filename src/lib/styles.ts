/**
 * Common Styles and Constants
 *
 * Centralized style patterns and constants to reduce inline styles
 * and promote consistency across the application.
 */

import { StyleSheet } from "react-native";

/**
 * Common spacing values
 * Use these instead of hardcoded numbers for consistent spacing
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Floating player dimensions and offsets
 * Centralized values for the mini player at the bottom of the screen
 */
export const floatingPlayer = {
  /** Height of the floating mini player */
  height: 64,
  /** Bottom offset above tab bar */
  bottomOffset: 100,
  /** Padding to add to scrollable lists when player is visible */
  listPadding: 84,
} as const;

/**
 * Common reusable style objects
 * These can be spread into component styles or used directly
 */
export const commonStyles = StyleSheet.create({
  // Flex layouts
  flexRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  flexRowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  flexRowCenter: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  flexColumn: {
    flexDirection: "column",
  },
  flex1: {
    flex: 1,
  },
  flexWrap: {
    flexWrap: "wrap",
  },

  // Alignment
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  alignCenter: {
    alignItems: "center",
  },
  justifyCenter: {
    justifyContent: "center",
  },
  alignStart: {
    alignItems: "flex-start",
  },
  alignEnd: {
    alignItems: "flex-end",
  },

  // Common spacing
  marginBottomXs: {
    marginBottom: spacing.xs,
  },
  marginBottomSm: {
    marginBottom: spacing.sm,
  },
  marginBottomMd: {
    marginBottom: spacing.md,
  },
  marginBottomLg: {
    marginBottom: spacing.lg,
  },
  marginBottomXl: {
    marginBottom: spacing.xl,
  },

  paddingHorizontalMd: {
    paddingHorizontal: spacing.md,
  },
  paddingHorizontalLg: {
    paddingHorizontal: spacing.lg,
  },
  paddingVerticalSm: {
    paddingVertical: spacing.sm,
  },
  paddingVerticalMd: {
    paddingVertical: spacing.md,
  },

  // Common containers
  sectionContainer: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  // Typography helpers
  textCenter: {
    textAlign: "center",
  },
  textBold: {
    fontWeight: "600",
  },
  textSemiBold: {
    fontWeight: "500",
  },
});

/**
 * Common border radius values
 */
export const borderRadius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  round: 999, // Fully rounded
} as const;

/**
 * Common shadow styles (iOS/Android compatible)
 */
export const shadows = {
  small: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  large: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;
