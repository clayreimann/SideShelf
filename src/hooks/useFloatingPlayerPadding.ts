/**
 * useFloatingPlayerPadding Hook
 *
 * Centralized hook for calculating bottom padding when the floating player is visible.
 * This replaces duplicated padding logic across multiple components.
 *
 * Usage:
 * ```tsx
 * const contentPadding = useFloatingPlayerPadding();
 * <FlatList contentContainerStyle={[styles.container, contentPadding]} />
 * ```
 */

import { floatingPlayer } from '@/lib/styles';
import { useThemedStyles } from '@/lib/theme';
import { useAppStore } from '@/stores/appStore';
import { useMemo } from 'react';

export function useFloatingPlayerPadding() {
  const { tabs } = useThemedStyles();
  const currentTrack = useAppStore((state) => state.player.currentTrack);

  return useMemo(
    () => ({
      paddingBottom: (currentTrack ? floatingPlayer.listPadding : 0) + tabs.tabBarSpace,
    }),
    [currentTrack, tabs.tabBarSpace]
  );
}
