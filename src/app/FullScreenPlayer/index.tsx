/**
 * FullScreenPlayer - Full-screen modal audio player controller
 *
 * This component provides comprehensive audio controls including:
 * - Large cover image
 * - Progress bar with seek functionality
 * - Current time and chapter information
 * - Play/pause, skip forward/backward controls
 * - Playback rate and volume controls
 */

import JumpTrackButton from '@/components/player/JumpTrackButton';
import PlayPauseButton from '@/components/player/PlayPauseButton';
import SkipButton from '@/components/player/SkipButton';
import { ProgressBar } from '@/components/ui';
import CoverImage from '@/components/ui/CoverImange';
import { getJumpBackwardInterval, getJumpForwardInterval } from '@/lib/appSettings';
import { useThemedStyles } from '@/lib/theme';
import { playerService } from '@/services/PlayerService';
import { usePlayer } from '@/stores/appStore';
import { router, Stack } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';


function durationToUnits(seconds: number): number[] {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hours, minutes, secs];
}

function formatTimeWithUnits(seconds: number, includeSeconds: boolean = true): string {
  const [hours, minutes, secs] = durationToUnits(seconds);

  const secondsString = `${secs.toString().padStart(2, '0')}s`;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${includeSeconds ? secondsString : ''}`;
  } else {
    return `${minutes}m ${secondsString}`;
  }
}


export default function FullScreenPlayer() {
  const { styles, isDark } = useThemedStyles();
  const { width, height } = useWindowDimensions();

  const { currentTrack, position, currentChapter, playbackRate, isPlaying } = usePlayer();
  const [isSeekingSlider, setIsSeekingSlider] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [jumpForwardInterval, setJumpForwardInterval] = useState(30);
  const [jumpBackwardInterval, setJumpBackwardInterval] = useState(15);

  // Load jump intervals from settings
  useEffect(() => {
    const loadIntervals = async () => {
      const [forward, backward] = await Promise.all([
        getJumpForwardInterval(),
        getJumpBackwardInterval(),
      ]);
      setJumpForwardInterval(forward);
      setJumpBackwardInterval(backward);
    };
    loadIntervals();
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handlePlayPause = useCallback(async () => {
    try {
      await playerService.togglePlayPause();
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to toggle play/pause:', error);
    }
  }, []);

  const handleSeekStart = useCallback((value: number) => {
    setIsSeekingSlider(true);
    setSliderValue(value);
  }, []);

  const handleSeekChange = useCallback((value: number) => {
    setSliderValue(value);
  }, []);

  const handleSeekComplete = useCallback(async (value: number) => {
    setIsSeekingSlider(false);
    try {
      await playerService.seekTo(value);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to seek:', error);
    }
  }, []);

  const handleSkipBackward = useCallback(async () => {
    try {
      await playerService.seekTo(Math.max(position - jumpBackwardInterval, 0));
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to skip backward:', error);
    }
  }, [position, jumpBackwardInterval]);

  const handleSkipForward = useCallback(async () => {
    try {
      await playerService.seekTo(position + jumpForwardInterval);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to skip forward:', error);
    }
  }, [position, jumpForwardInterval]);

  const handleRateChange = useCallback(async (rate: number) => {
    try {
      await playerService.setRate(rate);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to set playback rate:', error);
    }
  }, []);

  const handleVolumeChange = useCallback(async (newVolume: number) => {
    try {
      await playerService.setVolume(newVolume);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to set volume:', error);
    }
  }, []);

  const handleStartOfChapter = useCallback(async () => {
    if (!currentChapter) {
      return;
    }
    try {
      await playerService.seekTo(currentChapter?.chapter.start || 0);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to seek to start:', error);
    }
  }, [currentChapter]);

  const handleNextChapter = useCallback(async () => {
    if (!currentChapter) {
      return;
    }
    try {
      await playerService.seekTo(currentChapter?.chapter.end || 0);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to seek to next chapter:', error);
    }
  }, [currentChapter]);

  if (!currentTrack) {
    return null;
  }

  const duration = currentTrack.duration;
  const currentPosition = position;
  const chapterTitle = currentChapter?.chapter.title || 'Loading...';
  const chapterPosition = currentChapter?.positionInChapter || 0;
  const chapterDuration = currentChapter?.chapterDuration || 0;

  const coverSize = Math.min(width - 64, height * 0.4);

  return (
    <>
      <Stack.Screen options={{
        title: currentTrack.title, headerRight: () => (<TouchableOpacity onPress={handleClose}>
          <Text style={{ fontSize: 16, color: isDark ? 'white' : 'black' }}>Done</Text>
        </TouchableOpacity>)
      }} />
      {/* Content */}
      <View style={{
        flex: 1,
        paddingHorizontal: 32,
        justifyContent: 'center',
      }}>
        {/* Cover and Track Info */}
        <View style={{ alignItems: 'center' }}>
          {/* Cover Image */}
          <View style={{ width: coverSize, height: coverSize, borderRadius: 12, marginBottom: 24, overflow: 'hidden' }}>
            <CoverImage uri={currentTrack.coverUri} title={currentTrack.title} fontSize={48} />
          </View>

          {/* Track Info */}
          <Text
            style={[styles.text, {
              fontSize: 24,
              fontWeight: '700',
              textAlign: 'center',
              marginBottom: 8,
            }]}
            numberOfLines={1}
          >
            {chapterTitle}
          </Text>
          <Text
            style={[styles.text, {
              fontSize: 18,
              opacity: 0.7,
              textAlign: 'center',
              marginBottom: 16,
            }]}
            numberOfLines={1}
          >
            {currentTrack.author}
          </Text>
        </View>

        {/* Progress and Controls */}
        <View>
          <ProgressBar
            progress={chapterPosition / chapterDuration}
            variant="large"
            interactive={true}
            minValue={currentChapter?.chapter.start || 0}
            maxValue={currentChapter?.chapter.end || chapterDuration}
            onSeekStart={handleSeekStart}
            onSeekChange={handleSeekChange}
            onSeekComplete={handleSeekComplete}
            showTimeLabels={true}
            currentTime={chapterPosition}
            duration={chapterDuration}
            containerStyle={{ marginBottom: 8 }}
            showPercentage={true}
            customPercentageText={`${formatTimeWithUnits(duration - currentPosition, false)} remaining`}
          />

          {/* Main Controls */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 32,
          }}>
            <JumpTrackButton direction="backward" onPress={handleStartOfChapter} hitBoxSize={60} />
            <SkipButton
              direction="backward"
              interval={jumpBackwardInterval}
              onPress={handleSkipBackward}
              hitBoxSize={60}
            />
            <PlayPauseButton onPress={handlePlayPause} hitBoxSize={100} iconSize={48} />
            <SkipButton
              direction="forward"
              interval={jumpForwardInterval}
              onPress={handleSkipForward}
              hitBoxSize={60}
            />
            <JumpTrackButton direction="forward" onPress={handleNextChapter} hitBoxSize={60} />
          </View>

          {/* Secondary Controls */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            {/* Playback Rate */}
            {/* <View style={{ alignItems: 'center' }}>
              <Text style={[styles.text, { fontSize: 12, opacity: 0.7, marginBottom: 8 }]}>
                Speed
              </Text>
              <View style={{ flexDirection: 'row' }}>
                {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                  <TouchableOpacity
                    key={rate}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 4,
                      backgroundColor: playbackRate === rate ? '#007AFF' : 'transparent',
                      marginHorizontal: 2,
                    }}
                    onPress={() => handleRateChange(rate)}
                  >
                    <Text style={{
                      fontSize: 12,
                      color: playbackRate === rate ? 'white' : (isDark ? '#fff' : '#000'),
                      fontWeight: playbackRate === rate ? '600' : 'normal',
                    }}>
                      {rate}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View> */}

            {/* Volume */}
            {/* <View style={{ alignItems: 'center', flex: 1, marginLeft: 32 }}>
              <Text style={[styles.text, { fontSize: 12, opacity: 0.7, marginBottom: 8 }]}>
                Volume
              </Text>
            </View> */}
          </View>
        </View>
      </View>

    </>
  );
}
