/**
 * TraceDumps
 *
 * Lists trace dump files from the Documents directory.
 * Follows CoordinatorDiagnostics card/button visual style.
 */

import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const log = logger.forTag("TraceDumps");

interface DumpFileInfo {
  name: string;
  uri: string;
  sizeBytes: number | undefined;
  timestamp: string; // raw suffix from filename
}

function parseDumpFiles(): DumpFileInfo[] {
  try {
    const dir = new Directory(Paths.document);
    const items = dir.list();
    const dumps = items
      .filter((item): item is File => item instanceof File && item.name.startsWith("trace-dump-"))
      .map(
        (file): DumpFileInfo => ({
          name: file.name,
          uri: file.uri,
          sizeBytes: file.size,
          // Extract timestamp from filename: trace-dump-2026-03-13T10-23-45-123Z.json
          timestamp: file.name.replace("trace-dump-", "").replace(".json", ""),
        })
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // newest first
    return dumps;
  } catch (err) {
    log.error("[parseDumpFiles] Failed to list dump files", err as Error);
    return [];
  }
}

function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return "? KB";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function TraceDumps() {
  const { colors, isDark } = useThemedStyles();
  const [dumps, setDumps] = useState<DumpFileInfo[]>([]);

  const refresh = useCallback(() => {
    setDumps(parseDumpFiles());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleShare = useCallback(async (dump: DumpFileInfo) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(dump.uri, {
          mimeType: "application/json",
          dialogTitle: `Share ${dump.name}`,
        });
      } else {
        Alert.alert("Sharing unavailable", "Sharing is not available on this device.");
      }
    } catch (err) {
      log.error("[TraceDumps] Share failed", err as Error);
      Alert.alert("Error", "Failed to share dump file.");
    }
  }, []);

  const handleDelete = useCallback(
    (dump: DumpFileInfo) => {
      Alert.alert("Delete Dump", `Delete ${dump.name}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const file = new File(Paths.document, dump.name);
              await file.delete();
              refresh();
            } catch (err) {
              log.error("[TraceDumps] Delete failed", err as Error);
            }
          },
        },
      ]);
    },
    [refresh]
  );

  const handleClearAll = useCallback(() => {
    if (dumps.length === 0) return;
    Alert.alert("Clear All Dumps", `Delete ${dumps.length} dump file(s)?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear All",
        style: "destructive",
        onPress: async () => {
          for (const dump of dumps) {
            try {
              const file = new File(Paths.document, dump.name);
              await file.delete();
            } catch (err) {
              log.error(`[TraceDumps] Failed to delete ${dump.name}`, err as Error);
            }
          }
          refresh();
        },
      },
    ]);
  }, [dumps, refresh]);

  const cardBackground = isDark ? "#2a2a2a" : "#f5f5f5";

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Trace Dumps ({dumps.length})
        </Text>
        {dumps.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={[styles.clearButton, { color: colors.error }]}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>
      {dumps.length === 0 && (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No trace dumps yet. Long-press play/pause to capture one.
        </Text>
      )}
      {dumps.map((dump) => (
        <View
          key={dump.name}
          style={[
            styles.dumpRow,
            { backgroundColor: cardBackground, borderColor: colors.separator },
          ]}
        >
          <View style={styles.dumpMeta}>
            <Text style={[styles.dumpTimestamp, { color: colors.textPrimary }]} numberOfLines={1}>
              {dump.timestamp}
            </Text>
            <Text style={[styles.dumpSize, { color: colors.textSecondary }]}>
              {formatBytes(dump.sizeBytes)}
            </Text>
          </View>
          <View style={styles.dumpActions}>
            <TouchableOpacity onPress={() => handleShare(dump)} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: colors.link }]}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(dump)} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 24 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold" },
  clearButton: { fontSize: 14 },
  emptyText: { fontSize: 13, fontStyle: "italic", marginBottom: 8 },
  dumpRow: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
  },
  dumpMeta: { marginBottom: 6 },
  dumpTimestamp: { fontSize: 12, fontFamily: "monospace" },
  dumpSize: { fontSize: 11, marginTop: 2 },
  dumpActions: { flexDirection: "row", gap: 12 },
  actionButton: { paddingVertical: 2 },
  actionText: { fontSize: 13, fontWeight: "500" },
});
