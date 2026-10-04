import { JumpHistoryRows } from "@/components/player/JumpHistoryList";
import { CollapsibleSection } from "@/components/ui";
import { translate } from "@/i18n";
import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { usePlayerState } from "@/stores";
import type { JumpHistoryEntry } from "@/types/player";
import React, { memo, useCallback } from "react";
import { StyleSheet, Text } from "react-native";

interface JumpHistorySectionProps {
  libraryItemId: string;
}

const log = logger.forTag("JumpHistorySection");

const JumpHistorySection = memo(function JumpHistorySection({
  libraryItemId,
}: JumpHistorySectionProps) {
  const { colors } = useThemedStyles();
  const currentTrack = usePlayerState((state) => state.player.currentTrack);
  const jumpHistory = usePlayerState((state) => state.player.jumpHistory);
  const isActiveItem = currentTrack?.libraryItemId === libraryItemId;
  const entries = jumpHistory?.libraryItemId === libraryItemId ? jumpHistory.entries : [];

  const handleSelect = useCallback(async (entry: JumpHistoryEntry) => {
    try {
      await playerService.seekTo(entry.fromPosition, { suppressJumpHistory: true });
    } catch (error) {
      log.error("[handleSelect] Failed to seek to jump-history entry", error as Error);
    }
  }, []);

  if (!isActiveItem) {
    return null;
  }

  return (
    <CollapsibleSection
      title={translate("player.jumpHistory.sectionTitle", { count: entries.length })}
      defaultExpanded={false}
    >
      {entries.length > 0 ? (
        <JumpHistoryRows entries={entries} onSelect={handleSelect} />
      ) : (
        <Text style={[styles.emptyState, { color: colors.textSecondary }]}>
          {translate("player.jumpHistory.empty")}
        </Text>
      )}
    </CollapsibleSection>
  );
});

export default JumpHistorySection;

const styles = StyleSheet.create({
  emptyState: {
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
