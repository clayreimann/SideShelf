import JumpHistoryList from "@/components/player/JumpHistoryList";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import type { JumpHistoryEntry } from "@/types/player";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

interface JumpHistoryModalProps {
  visible: boolean;
  entries: JumpHistoryEntry[];
  onClose: () => void;
  onSelect: (entry: JumpHistoryEntry) => void;
}

export default function JumpHistoryModal({
  visible,
  entries,
  onClose,
  onSelect,
}: JumpHistoryModalProps) {
  const { colors } = useThemedStyles();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
              {translate("player.jumpHistory.title")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate("player.jumpHistory.close")}
              hitSlop={12}
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          {entries.length > 0 ? (
            <JumpHistoryList entries={entries} onSelect={onSelect} />
          ) : (
            <Text style={[styles.emptyState, { color: colors.textSecondary }]}>
              {translate("player.jumpHistory.empty")}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
    minHeight: 180,
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  emptyState: {
    fontSize: 15,
    paddingHorizontal: 16,
    paddingTop: 24,
    textAlign: "center",
  },
});
