import JumpHistoryList from "@/components/player/JumpHistoryList";
import { CollapsibleSection } from "@/components/ui";
import { translate } from "@/i18n";
import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { usePlayerState } from "@/stores";
import type { JumpHistoryEntry } from "@/types/player";
import React, { useCallback } from "react";
import { StyleSheet, Text } from "react-native";

interface JumpHistorySectionProps {
  libraryItemId: string;
}

const log = logger.forTag("JumpHistorySection");

export default function JumpHistorySection({ libraryItemId }: JumpHistorySectionProps) {
  const { colors } = useThemedStyles();
  const jumpHistory = usePlayerState((state) => state.player.jumpHistory);
  const entries = jumpHistory?.libraryItemId === libraryItemId ? jumpHistory.entries : null;

  const handleSelect = useCallback(async (entry: JumpHistoryEntry) => {
    try {
      await playerService.seekTo(entry.fromPosition, { suppressJumpHistory: true });
    } catch (error) {
      log.error("[handleSelect] Failed to seek to jump-history entry", error as Error);
    }
  }, []);

  if (!entries) {
    return null;
  }

  return (
    <CollapsibleSection
      title={translate("player.jumpHistory.sectionTitle", { count: entries.length })}
      defaultExpanded={false}
    >
      {entries.length > 0 ? (
        <JumpHistoryList entries={entries} onSelect={handleSelect} />
      ) : (
        <Text style={[styles.emptyState, { color: colors.textSecondary }]}>
          {translate("player.jumpHistory.empty")}
        </Text>
      )}
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
