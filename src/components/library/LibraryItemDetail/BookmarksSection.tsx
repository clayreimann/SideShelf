import { CollapsibleSection } from "@/components/ui";
import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { ApiAudioBookmark } from "@/types/api";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

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

  const showBookmarkContextMenu = useCallback(
    (bookmark: ApiAudioBookmark) => {
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: bookmark.title,
            options: ["Cancel", "Rename", "Delete"],
            destructiveButtonIndex: 2,
            cancelButtonIndex: 0,
          },
          (index) => {
            if (index === 1) {
              openRenameModal(bookmark);
            } else if (index === 2) {
              void handleDeleteBookmark(bookmark);
            }
          }
        );
      } else {
        // Android fallback
        Alert.alert(bookmark.title, "", [
          {
            text: "Rename",
            onPress: () => openRenameModal(bookmark),
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Alert.alert("Delete Bookmark", "Are you sure you want to delete this bookmark?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => void handleDeleteBookmark(bookmark),
                },
              ]);
            },
          },
          { text: "Cancel", style: "cancel" },
        ]);
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
          <TouchableOpacity
            key={bookmark.id}
            onPress={() => void handleJumpToBookmark(bookmark.time)}
            onLongPress={() => showBookmarkContextMenu(bookmark)}
            style={{
              paddingVertical: 12,
              borderBottomWidth: index < sortedBookmarks.length - 1 ? 1 : 0,
              borderBottomColor: isDark ? "#444" : "#eee",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="bookmark" size={16} color={colors.textPrimary} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.text, { fontWeight: "600", marginBottom: 2 }]}
                  numberOfLines={1}
                >
                  {bookmark.title}
                </Text>
                <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                  {formatTime(bookmark.time)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
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
              <TouchableOpacity
                onPress={() => {
                  setShowRenameModal(false);
                  setRenamingBookmark(null);
                }}
                style={{ padding: 8 }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void handleSaveRename()} style={{ padding: 8 }}>
                <Text style={{ color: colors.link, fontSize: 15, fontWeight: "600" }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
