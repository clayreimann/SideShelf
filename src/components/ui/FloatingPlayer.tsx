/**
 * FloatingPlayer - Mini player UI that floats above the tab bar
 *
 * This component displays when audio is playing and shows:
 * - Item cover image
 * - Current chapter name
 * - Play/pause button
 * - Tapping anywhere else opens the full-screen modal
 */

import PlayPauseButton from '@/components/player/PlayPauseButton';
import CoverImage from '@/components/ui/CoverImange';
import { useThemedStyles } from '@/lib/theme';
import { playerService } from '@/services/PlayerService';
import { usePlayer } from '@/stores/appStore';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

export default function FloatingPlayer() {
  const { styles, isDark } = useThemedStyles();
  const { currentTrack, currentChapter } = usePlayer();

  // Don't show if no track is loaded
  if (!currentTrack) {
    return null;
  }

  const handlePlayPausePress = async () => {
    try {
      await playerService.togglePlayPause();
    } catch (error) {
      console.error('[FloatingPlayer] Failed to toggle play/pause:', error);
    }
  };

  const handlePlayerPress = () => {
    router.push('/FullScreenPlayer');
  };

  const chapterTitle = currentChapter?.chapter.title || 'Loading...';

  return (
    <View style={{
      position: 'absolute',
      bottom: 100, // Above tab bar
      left: 12,
      right: 12,
      height: 64,
      borderRadius: 8,
      backgroundColor: isDark ? '#1c1c1e' : '#ffffff',
      borderTopWidth: 1,
      borderTopColor: isDark ? '#333' : '#e0e0e0',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      shadowColor: isDark ? '#fff' : '#000',
      shadowOffset: {
        width: 0,
        height: 0,
      },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    }}>
      {/* Tappable area for opening modal */}
      <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', }} onPress={handlePlayerPress}>
        {/* Cover Image */}
        <View style={{width: 48,height: 48,borderRadius: 6,marginRight: 12,overflow: 'hidden',}}>
          <CoverImage uri={currentTrack?.coverUri ?? ''} title={currentTrack?.title ?? 'No track selected'} fontSize={48} />
        </View>

        {/* Track Info */}
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={[styles.text, { fontSize: 14, fontWeight: '600', marginBottom: 2, }]} numberOfLines={1}>
            {chapterTitle}
          </Text>
          <Text style={[styles.text, { fontSize: 12, opacity: 0.7, }]} numberOfLines={1}>
            {currentTrack?.title ?? 'No selection'}
          </Text>
        </View>
      </Pressable>

      <PlayPauseButton onPress={handlePlayPausePress} iconSize={32} />
    </View>
  );
}
