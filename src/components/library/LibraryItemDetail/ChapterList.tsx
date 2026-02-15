import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { getPlayedChapters, getUpcomingChapters } from "@/db/helpers/chapters";
import { translate } from "@/i18n";
import { formatTime } from "@/lib/helpers/formatters";
import { useThemedStyles } from "@/lib/theme";
import { playerService } from "@/services/PlayerService";
import { ApiBookChapter } from "@/types/api";
import { ChapterRow } from "@/types/database";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type ChapterListProps = {
  chapters: ApiBookChapter[];
  currentPosition?: number;
  libraryItemId?: string;
  isCurrentlyPlaying?: boolean;
};

export default function ChapterList({
  chapters,
  currentPosition = 0,
  libraryItemId,
  isCurrentlyPlaying = false,
}: ChapterListProps) {
  const { styles, isDark } = useThemedStyles();
  const [showPlayedChapters, setShowPlayedChapters] = useState(false);

  // Convert ApiBookChapter to ChapterRow format for helper functions
  const chapterRows: ChapterRow[] = useMemo(() => {
    return chapters.map((ch) => ({
      id: `${ch.id}`,
      mediaId: "", // Not needed for our comparison
      chapterId: ch.id,
      start: ch.start,
      end: ch.end,
      title: ch.title,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }, [chapters]);

  // Determine played and upcoming chapters
  const playedChapters = useMemo(() => {
    if (currentPosition === 0) return [];
    return getPlayedChapters(chapterRows, currentPosition);
  }, [chapterRows, currentPosition]);

  const upcomingChapters = useMemo(() => {
    return getUpcomingChapters(chapterRows, currentPosition);
  }, [chapterRows, currentPosition]);

  // Get chapters to display
  const displayedChapters = useMemo(() => {
    if (showPlayedChapters) {
      return chapters;
    }
    // Only show upcoming chapters (includes current chapter)
    const upcomingIds = new Set(upcomingChapters.map((ch) => ch.chapterId));
    return chapters.filter((ch) => upcomingIds.has(ch.id));
  }, [chapters, upcomingChapters, showPlayedChapters]);

  // Determine if a chapter is played
  const isChapterPlayed = useMemo(() => {
    const playedIds = new Set(playedChapters.map((ch) => ch.chapterId));
    return (chapterId: number) => playedIds.has(chapterId);
  }, [playedChapters]);

  if (chapters.length === 0) {
    return (
      <View>
        <Text style={[styles.text, { fontStyle: "italic", opacity: 0.7 }]}>
          {translate("chapters.empty")}
        </Text>
      </View>
    );
  }

  const handleChapterPress = async (chapterStart: number) => {
    if (!libraryItemId) return;

    try {
      // If not currently playing this item, start playback
      if (!isCurrentlyPlaying) {
        await playerService.playTrack(libraryItemId);
        // Small delay to ensure track is loaded before seeking
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await playerService.seekTo(chapterStart);
    } catch (error) {
      console.error("[ChapterList] Failed to jump to chapter:", error);
    }
  };

  return (
    <CollapsibleSection title={translate("libraryItem.chapters", { count: chapters.length })}>
      {/* Show expand button if there are played chapters hidden */}
      {playedChapters.length > 0 && !showPlayedChapters && (
        <TouchableOpacity
          onPress={() => setShowPlayedChapters(true)}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: isDark ? "#444" : "#eee",
          }}
        >
          <Text style={[styles.text, { fontSize: 14, opacity: 0.7 }]}>
            {playedChapters.length === 1
              ? translate("chapters.showPlayed", { count: playedChapters.length })
              : translate("chapters.showPlayedPlural", { count: playedChapters.length })}
          </Text>
        </TouchableOpacity>
      )}

      {/* Show collapse button if played chapters are visible */}
      {playedChapters.length > 0 && showPlayedChapters && (
        <TouchableOpacity
          onPress={() => setShowPlayedChapters(false)}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: isDark ? "#444" : "#eee",
          }}
        >
          <Text style={[styles.text, { fontSize: 14, opacity: 0.7 }]}>
            {translate("chapters.hidePlayed")}
          </Text>
        </TouchableOpacity>
      )}

      {displayedChapters.map((chapter, index) => {
        const isPlayed = isChapterPlayed(chapter.id);
        const chapterDuration = chapter.end - chapter.start;

        return (
          <TouchableOpacity
            key={chapter.id}
            onPress={() => handleChapterPress(chapter.start)}
            style={{
              paddingVertical: 8,
              borderBottomWidth: index < displayedChapters.length - 1 ? 1 : 0,
              borderBottomColor: isDark ? "#444" : "#eee",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text
                style={[
                  styles.text,
                  {
                    fontWeight: "600",
                    marginBottom: 2,
                    opacity: isPlayed ? 0.5 : 1,
                  },
                ]}
              >
                {chapter.title}
              </Text>
              <Text style={[styles.text, { opacity: isPlayed ? 0.5 : 1 }]}>
                {formatTime(chapterDuration)}
              </Text>
            </View>
            <Text
              style={[
                styles.text,
                {
                  fontSize: 12,
                  opacity: isPlayed ? 0.4 : 0.7,
                },
              ]}
            >
              {formatTime(chapter.start)} - {formatTime(chapter.end)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </CollapsibleSection>
  );
}
