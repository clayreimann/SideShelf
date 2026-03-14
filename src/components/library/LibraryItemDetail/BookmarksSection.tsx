import { CollapsibleSection } from "@/components/ui";
import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { ApiAudioBookmark } from "@/types/api";
import { Ionicons } from "@expo/vector-icons";
import { MenuView } from "@react-native-menu/menu";
import React, { useCallback, useState } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";

const log = logger.forTag("BookmarksSection");

// Helper function to format time in seconds to HH:MM:SS
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}

interface BookmarksSectionProps {
  bookmarks: ApiAudioBookmark[];
  libraryItemId: string;
  isCurrentlyPlaying: boolean;
  onDeleteBookmark: (libraryItemId: string, time: number) => Promise<void>;
  onRenameBookmark: (libraryItemId: string, time: number, newTitle: string) => Promise<void>;
}

export default function BookmarksSection({
  bookmarks,
  libraryItemId,
  isCurrentlyPlaying,
  onDeleteBookmark,
  onRenameBookmark,
}: BookmarksSectionProps) {
  const { styles, colors, isDark } = useThemedStyles();
  const sortedBookmarks = [...bookmarks].sort((a, b) => a.time - b.time);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamingBookmark, setRenamingBookmark] = useState<ApiAudioBookmark | null>(null);

  const handleDeleteBookmark = useCallback(
    async (bookmark: ApiAudioBookmark) => {
      try {
        await onDeleteBookmark(libraryItemId, bookmark.time);
      } catch (error) {
        log.error("[handleDeleteBookmark] Failed to delete bookmark", error as Error);
        Alert.alert("Error", "Failed to delete bookmark. Please try again.");
      }
    },
    [libraryItemId, onDeleteBookmark]
  );

  const openRenameModal = useCallback((bookmark: ApiAudioBookmark) => {
    setRenamingBookmark(bookmark);
    setRenameValue(bookmark.title);
    setShowRenameModal(true);
  }, []);

  const handleSaveRename = useCallback(async () => {
    if (!renamingBookmark) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      await onRenameBookmark(libraryItemId, renamingBookmark.time, trimmed);
      setShowRenameModal(false);
      setRenamingBookmark(null);
    } catch (error) {
      log.error("[handleSaveRename] Failed to rename bookmark", error as Error);
      Alert.alert("Error", "Failed to rename bookmark. Please try again.");
    }
  }, [renamingBookmark, renameValue, libraryItemId, onRenameBookmark]);

  const handleBookmarkMenuAction = useCallback(
    (bookmark: ApiAudioBookmark, actionId: string) => {
      if (actionId === "rename") {
        openRenameModal(bookmark);
      } else if (actionId === "delete") {
        void handleDeleteBookmark(bookmark);
      }
    },
    [openRenameModal, handleDeleteBookmark]
  );

  const handleJumpToBookmark = useCallback(
    async (time: number) => {
      try {
        if (isCurrentlyPlaying) {
          await playerService.seekTo(time);
        } else {
          await playerService.playTrack(libraryItemId);
          await playerService.seekTo(time);
        }
      } catch (error) {
        log.error("[handleJumpToBookmark] Failed to jump to bookmark", error as Error);
        Alert.alert("Error", "Failed to jump to bookmark. Please try again.");
      }
    },
    [libraryItemId, isCurrentlyPlaying]
  );

  if (bookmarks.length === 0) {
    return null;
  }

  return (
    <>
      <CollapsibleSection title={`Bookmarks (${bookmarks.length})`} defaultExpanded={false}>
        {sortedBookmarks.map((bookmark, index) => (
          <Pressable
            key={`${bookmark.id}-${bookmark.time}`}
            onPress={() => void handleJumpToBookmark(bookmark.time)}
            style={{
              paddingVertical: 12,
              borderBottomWidth: index < sortedBookmarks.length - 1 ? 1 : 0,
              borderBottomColor: isDark ? "#444" : "#eee",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="bookmark" size={16} color={colors.textPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.text, { fontWeight: "600", marginBottom: 2 }]} numberOfLines={1}>
                {bookmark.title}
              </Text>
              <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                {formatTime(bookmark.time)}
              </Text>
            </View>
            <MenuView
              title={bookmark.title}
              shouldOpenOnLongPress={false}
              onPressAction={({ nativeEvent }) =>
                handleBookmarkMenuAction(bookmark, nativeEvent.event)
              }
              actions={[
                { id: "rename", title: "Rename" },
                { id: "delete", title: "Delete", attributes: { destructive: true } },
              ]}
            >
              <Pressable
                hitSlop={8}
                style={{ padding: 4 }}
                onPress={(event) => {
                  event.stopPropagation();
                }}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
              </Pressable>
            </MenuView>
          </Pressable>
        ))}
      </CollapsibleSection>

      {/* Rename bookmark bottom sheet modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowRenameModal(false);
          setRenamingBookmark(null);
        }}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            style={{
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              padding: 16,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
            }}
          >
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 12,
              }}
            >
              Rename Bookmark
            </Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              returnKeyType="done"
              style={{
                borderWidth: 1,
                borderColor: isDark ? "#444" : "#ccc",
                borderRadius: 8,
                padding: 10,
                color: colors.textPrimary,
                fontSize: 15,
                marginBottom: 16,
              }}
              onSubmitEditing={() => void handleSaveRename()}
            />
            <View style={{ flexDirection: "row", gap: 12, justifyContent: "flex-end" }}>
              <Pressable
                onPress={() => {
                  setShowRenameModal(false);
                  setRenamingBookmark(null);
                }}
                style={{ padding: 8 }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void handleSaveRename()} style={{ padding: 8 }}>
                <Text style={{ color: colors.link, fontSize: 15, fontWeight: "600" }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
