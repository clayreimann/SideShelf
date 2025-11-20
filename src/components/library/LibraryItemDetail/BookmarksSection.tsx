import { CollapsibleSection } from "@/components/ui";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { ApiAudioBookmark } from "@/types/api";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";

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
  onDeleteBookmark: (libraryItemId: string, bookmarkId: string) => Promise<void>;
}

export default function BookmarksSection({
  bookmarks,
  libraryItemId,
  isCurrentlyPlaying,
  onDeleteBookmark,
}: BookmarksSectionProps) {
  const { styles, colors, isDark } = useThemedStyles();

  const handleDeleteBookmark = useCallback(
    async (bookmarkId: string) => {
      Alert.alert("Delete Bookmark", "Are you sure you want to delete this bookmark?", [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await onDeleteBookmark(libraryItemId, bookmarkId);
            } catch (error) {
              console.error("[BookmarksSection] Failed to delete bookmark:", error);
              Alert.alert("Error", "Failed to delete bookmark. Please try again.");
            }
          },
        },
      ]);
    },
    [libraryItemId, onDeleteBookmark]
  );

  const handleJumpToBookmark = useCallback(
    async (time: number) => {
      try {
        if (isCurrentlyPlaying) {
          // If playing, just seek to the bookmark time
          await playerService.seekTo(time);
        } else {
          // If not playing, start playing from the bookmark time
          await playerService.playTrack(libraryItemId, time);
        }
      } catch (error) {
        console.error("[BookmarksSection] Failed to jump to bookmark:", error);
        Alert.alert("Error", "Failed to jump to bookmark. Please try again.");
      }
    },
    [libraryItemId, isCurrentlyPlaying]
  );

  if (bookmarks.length === 0) {
    return null;
  }

  return (
    <CollapsibleSection title={`Bookmarks (${bookmarks.length})`} defaultExpanded={false}>
      {bookmarks
        .sort((a, b) => a.time - b.time)
        .map((bookmark, index) => (
          <View
            key={bookmark.id}
            style={{
              paddingVertical: 12,
              borderBottomWidth: index < bookmarks.length - 1 ? 1 : 0,
              borderBottomColor: isDark ? "#444" : "#eee",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => handleJumpToBookmark(bookmark.time)}
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
              <TouchableOpacity
                onPress={() => handleDeleteBookmark(bookmark.id)}
                style={{ padding: 8 }}
              >
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
    </CollapsibleSection>
  );
}
