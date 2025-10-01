/**
 * FloatingPlayer - Mini player UI that floats above the tab bar
 *
 * This component displays when audio is playing and shows:
 * - Item cover image
 * - Current chapter name
 * - Play/pause button
 * - Tapping anywhere else opens the full-screen modal
 */

import { useThemedStyles } from '@/lib/theme';
import { playerService } from '@/services/PlayerService';
import { useAppStore } from '@/stores/appStore';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';

export default function FloatingPlayer() {
  const { styles, isDark } = useThemedStyles();
  const { player, togglePlayPause } = useAppStore();

  // Don't show if no track is loaded
  if (!player.currentTrack) {
    return null;
  }

  const { currentTrack, currentChapter, isPlaying } = player;

  const handlePlayPausePress = async () => {
    try {
      await playerService.togglePlayPause();
      await togglePlayPause();
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
      bottom: 100, // Above tab bar (adjust based on your tab bar height)
      left: 0,
      right: 0,
      height: 64,
      backgroundColor: isDark ? '#1c1c1e' : '#ffffff',
      borderTopWidth: 1,
      borderTopColor: isDark ? '#333' : '#e0e0e0',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: -2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 5,
    }}>
      {/* Tappable area for opening modal */}
      <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', }} onPress={handlePlayerPress}>
        {/* Cover Image */}
        <View style={{
          width: 48,
          height: 48,
          borderRadius: 6,
          backgroundColor: isDark ? '#333' : '#f0f0f0',
          marginRight: 12,
          overflow: 'hidden',
        }}>
          {currentTrack.coverUri ? (
            <Image
              source={{ uri: currentTrack.coverUri }}
              style={{
                width: '100%',
                height: '100%',
              }}
              resizeMode="cover"
            />
          ) : (
            <View style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Text style={{
                fontSize: 12,
                color: isDark ? '#888' : '#666',
              }}>
                📚
              </Text>
            </View>
          )}
        </View>

        {/* Track Info */}
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={[styles.text, { fontSize: 14, fontWeight: '600', marginBottom: 2, }]} numberOfLines={1}>
            {chapterTitle}
          </Text>
          <Text style={[styles.text, { fontSize: 12, opacity: 0.7, }]} numberOfLines={1}>
            {currentTrack.title}
          </Text>
        </View>
      </Pressable>

      {/* Play/Pause Button */}
      <Pressable style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center', }} onPress={handlePlayPausePress}>
        <FontAwesome6 name={isPlaying ? 'pause' : 'play'} size={32} color={isDark ? 'white' : 'black'} />
      </Pressable>
    </View>
  );
}
