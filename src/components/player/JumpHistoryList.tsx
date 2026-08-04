import { translate } from "@/i18n";
import { formatTime } from "@/lib/helpers/formatters";
import { useThemedStyles } from "@/lib/theme";
import type { JumpCategory, JumpHistoryEntry, JumpSurface } from "@/types/player";
import React, { memo, useCallback, useMemo, useRef } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

interface JumpHistoryListProps {
  entries: JumpHistoryEntry[];
  onSelect: (entry: JumpHistoryEntry) => void;
  now?: number;
}

interface JumpHistoryRowProps {
  entry: JumpHistoryEntry;
  isLast: boolean;
  now: number;
  onSelect: (entry: JumpHistoryEntry) => void;
}

function getSourceLabel(surface: JumpSurface): string {
  switch (surface) {
    case "full_screen":
      return translate("player.jumpHistory.source.fullScreen");
    case "item_detail":
      return translate("player.jumpHistory.source.itemDetail");
    case "lock_screen":
      return translate("player.jumpHistory.source.lockScreen");
    case "native_player":
      return translate("player.jumpHistory.source.nativePlayer");
  }
}

function getCategoryLabel(category: JumpCategory): string {
  switch (category) {
    case "scrub":
      return translate("player.jumpHistory.category.scrub");
    case "skip_forward":
      return translate("player.jumpHistory.category.skipForward");
    case "skip_backward":
      return translate("player.jumpHistory.category.skipBackward");
    case "chapter":
      return translate("player.jumpHistory.category.chapter");
    case "bookmark":
      return translate("player.jumpHistory.category.bookmark");
    case "unexpected_native":
      return translate("player.jumpHistory.category.unexpectedNative");
  }
}

function formatSignedDelta(fromPosition: number, toPosition: number): string {
  const delta = toPosition - fromPosition;
  const sign = delta >= 0 ? "+" : "-";

  return `${sign}${formatTime(Math.abs(delta))}`;
}

function formatRelativeOccurrence(updatedAt: number, now: number): string {
  const elapsed = Math.max(0, now - updatedAt);
  const minutes = Math.floor(elapsed / 60_000);

  if (minutes < 1) {
    return translate("player.jumpHistory.justNow");
  }

  if (minutes < 60) {
    return translate("player.jumpHistory.minutesAgo", { count: minutes });
  }

  return translate("player.jumpHistory.hoursAgo", { count: Math.floor(minutes / 60) });
}

const JumpHistoryRow = memo(function JumpHistoryRow({
  entry,
  isLast,
  now,
  onSelect,
}: JumpHistoryRowProps) {
  const { colors } = useThemedStyles();
  const source = getSourceLabel(entry.surface);
  const category = getCategoryLabel(entry.category);
  const from = formatTime(entry.fromPosition);
  const to = formatTime(entry.toPosition);
  const delta = formatSignedDelta(entry.fromPosition, entry.toPosition);
  const when = formatRelativeOccurrence(entry.updatedAt, now);
  const accessibilityLabel = translate("player.jumpHistory.rowAccessibility", {
    source,
    category,
    from,
    to,
    delta,
    when,
  });
  const handlePress = useCallback(() => onSelect(entry), [entry, onSelect]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.separator, opacity: pressed ? 0.7 : 1 },
        isLast && styles.lastRow,
      ]}
    >
      <View style={styles.topLine}>
        <Text style={[styles.source, { color: colors.textPrimary }]}>{source}</Text>
        <Text style={[styles.category, { color: colors.textSecondary }]}>{category}</Text>
      </View>
      <View style={styles.bottomLine}>
        <Text style={[styles.positions, { color: colors.textPrimary }]}>
          {from} → {to}
        </Text>
        <Text style={[styles.delta, { color: colors.textPrimary }]}>{delta}</Text>
        <Text style={[styles.relativeTime, { color: colors.textSecondary }]}>{when}</Text>
      </View>
    </Pressable>
  );
});

function useSortedEntries(entries: JumpHistoryEntry[]): JumpHistoryEntry[] {
  return useMemo(
    () => [...entries].sort((first, second) => second.updatedAt - first.updatedAt),
    [entries]
  );
}

function usePresentationReferenceTime(now: number | undefined, isPresented: boolean): number {
  const referenceTime = useRef<number | null>(null);

  if (now !== undefined) {
    return now;
  }

  if (!isPresented) {
    referenceTime.current = null;
    return 0;
  }

  if (referenceTime.current === null) {
    referenceTime.current = Date.now();
  }

  return referenceTime.current;
}

export const JumpHistoryRows = memo(function JumpHistoryRows({
  entries,
  onSelect,
  now,
}: JumpHistoryListProps) {
  const sortedEntries = useSortedEntries(entries);
  const referenceTime = usePresentationReferenceTime(now, sortedEntries.length > 0);

  return (
    <View style={styles.content}>
      {sortedEntries.map((entry, index) => (
        <JumpHistoryRow
          key={entry.id}
          entry={entry}
          isLast={index === sortedEntries.length - 1}
          now={referenceTime}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
});

const JumpHistoryList = memo(function JumpHistoryList({
  entries,
  onSelect,
  now,
}: JumpHistoryListProps) {
  const sortedEntries = useSortedEntries(entries);
  const referenceTime = usePresentationReferenceTime(now, sortedEntries.length > 0);

  const keyExtractor = useCallback((entry: JumpHistoryEntry) => entry.id, []);
  const renderItem = useCallback(
    ({ item, index }: { item: JumpHistoryEntry; index: number }) => (
      <JumpHistoryRow
        entry={item}
        isLast={index === sortedEntries.length - 1}
        now={referenceTime}
        onSelect={onSelect}
      />
    ),
    [onSelect, referenceTime, sortedEntries.length]
  );

  return (
    <FlatList
      data={sortedEntries}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      style={styles.list}
      contentContainerStyle={styles.content}
    />
  );
});

export default JumpHistoryList;

const styles = StyleSheet.create({
  list: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 16,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  topLine: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  source: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  category: {
    fontSize: 13,
  },
  bottomLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  positions: {
    flex: 1,
    fontSize: 14,
  },
  delta: {
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  relativeTime: {
    fontSize: 12,
  },
});
