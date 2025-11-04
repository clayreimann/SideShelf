/**
 * ChapterList - Animated chapter list component for FullScreenPlayer
 *
 * Displays a scrollable list of chapters with current chapter highlighting
 * and auto-scroll functionality.
 */

import { getCurrentChapterIndex } from '@/db/helpers/chapters';
import { formatTime } from '@/lib/helpers/formatters';
import { useThemedStyles } from '@/lib/theme';
import type { CurrentChapter, PlayerTrack } from '@/types/player';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';

interface ChapterListProps {
  /** Chapters to display */
  chapters: PlayerTrack['chapters'];
  /** Current chapter information */
  currentChapter: CurrentChapter | null;
  /** Current playback position in seconds */
  position: number;
  /** Callback when a chapter is pressed */
  onChapterPress: (start: number) => void;
  /** Whether the chapter list is visible */
  showChapterList: boolean;
  /** Animation value for chapter list visibility (0 = hidden, 1 = visible) */
  chapterListAnim: Animated.Value;
  /** Container height for the list */
  containerHeight: number;
}

export default function ChapterList({
  chapters,
  currentChapter,
  position,
  onChapterPress,
  showChapterList,
  chapterListAnim,
  containerHeight,
}: ChapterListProps) {
  const { styles, isDark } = useThemedStyles();
  const chapterListRef = useRef<FlatList>(null);
  const [hasScrolledToChapter, setHasScrolledToChapter] = useState(false);

  // Interpolate chapter list opacity, translateY, and height
  const chapterListOpacity = chapterListAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const chapterListTranslateY = chapterListAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0], // Slide up from 20px below
  });
  const chapterListHeight = chapterListAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, containerHeight], // Animate height from 0 to maxHeight
  });

  // Auto-scroll to current chapter when list opens (only once per open)
  useEffect(() => {
    if (showChapterList && chapters.length > 0 && currentChapter && !hasScrolledToChapter) {
      const currentIndex = getCurrentChapterIndex(chapters, position);
      if (currentIndex >= 0) {
        setTimeout(() => {
          chapterListRef.current?.scrollToIndex({
            index: currentIndex,
            animated: true,
            viewPosition: 0.3, // Position current chapter 30% from top
          });
          setHasScrolledToChapter(true);
        }, 350); // Wait for animation to complete
      }
    }

    // Reset scroll flag when list closes
    if (!showChapterList) {
      setHasScrolledToChapter(false);
    }
  }, [showChapterList, chapters, currentChapter, position, hasScrolledToChapter]);

  // Track chapter changes and auto-scroll if list is open and user hasn't manually scrolled
  const previousChapterIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentChapterId = currentChapter?.chapter.id;
    if (
      showChapterList &&
      currentChapterId &&
      currentChapterId !== previousChapterIdRef.current &&
      chapters.length > 0 &&
      !hasScrolledToChapter
    ) {
      const currentIndex = getCurrentChapterIndex(chapters, position);
      if (currentIndex >= 0) {
        setTimeout(() => {
          chapterListRef.current?.scrollToIndex({
            index: currentIndex,
            animated: true,
            viewPosition: 0.3,
          });
        }, 100);
      }
    }
    previousChapterIdRef.current = currentChapterId;
  }, [currentChapter?.chapter.id, showChapterList, chapters, position, hasScrolledToChapter]);

  if (chapters.length === 0) {
    return null;
  }

  return (
    <Animated.View
      style={{
        height: chapterListHeight,
        opacity: chapterListOpacity,
        transform: [{ translateY: chapterListTranslateY }],
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <FlatList
        ref={chapterListRef}
        data={chapters}
        keyExtractor={(item) => item.id}
        onScrollBeginDrag={() => {
          // User started scrolling manually - don't auto-scroll anymore
          setHasScrolledToChapter(true);
        }}
        renderItem={({ item, index }) => {
          const isCurrentChapter = currentChapter?.chapter.id === item.id;
          const chapterDuration = item.end - item.start;

          return (
            <TouchableOpacity
              onPress={() => onChapterPress(item.start)}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor: isCurrentChapter
                  ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)')
                  : 'transparent',
                borderLeftWidth: isCurrentChapter ? 3 : 0,
                borderLeftColor: isDark ? '#007AFF' : '#007AFF',
                borderBottomWidth: index < chapters.length - 1 ? 1 : 0,
                borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              }}
            >
              <View style={{ flexDirection: 'column', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text
                    style={[
                      styles.text,
                      {
                        fontWeight: isCurrentChapter ? '600' : '400',
                        fontSize: 14,
                        marginBottom: 4,
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  {isCurrentChapter ? (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#007AFF',
                        marginLeft: 12,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: 'transparent',
                        marginLeft: 12,
                      }}
                    />
                  )}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[styles.text, { fontSize: 12, opacity: 0.6 }]}>
                    {formatTime(item.start)} - {formatTime(item.end)}
                  </Text>
                  <Text style={[styles.text, { fontSize: 12, opacity: 0.6 }]}>
                    {formatTime(chapterDuration)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        onScrollToIndexFailed={(info) => {
          // Fallback: scroll to offset if index scroll fails
          const wait = new Promise((resolve) => setTimeout(resolve, 500));
          wait.then(() => {
            chapterListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          });
        }}
        scrollEnabled={true}
      />
    </Animated.View>
  );
}
