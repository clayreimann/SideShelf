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

import { ProgressBar } from '@/components/ui';
import { useThemedStyles } from '@/lib/theme';
import { playerService } from '@/services/PlayerService';
import { usePlayer } from '@/stores/appStore';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { router, Stack } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Image,
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

  const { currentTrack, position, currentChapter, playbackRate, isPlaying, seekTo, skipForward, skipBackward, togglePlayPause, setPlaybackRate, setVolume } = usePlayer();
  const [isSeekingSlider, setIsSeekingSlider] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handlePlayPause = useCallback(async () => {
    try {
      await playerService.togglePlayPause();
      await togglePlayPause();
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to toggle play/pause:', error);
    }
  }, [togglePlayPause]);

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
      await seekTo(value);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to seek:', error);
    }
  }, [seekTo]);

  const handleSkipBackward = useCallback(async () => {
    try {
      await skipBackward(15);
      await playerService.seekTo(Math.max(position - 15, 0));
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to skip backward:', error);
    }
  }, [skipBackward, position]);

  const handleSkipForward = useCallback(async () => {
    try {
      await skipForward(30);
      await playerService.seekTo(position + 30);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to skip forward:', error);
    }
  }, [skipForward, position]);

  const handleRateChange = useCallback(async (rate: number) => {
    try {
      await playerService.setRate(rate);
      await setPlaybackRate(rate);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to set playback rate:', error);
    }
  }, [setPlaybackRate]);

  const handleVolumeChange = useCallback(async (newVolume: number) => {
    try {
      await playerService.setVolume(newVolume);
      await setVolume(newVolume);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to set volume:', error);
    }
  }, [setVolume]);

  const handleStartOfChapter = useCallback(async () => {
    if (!currentChapter) {
      return;
    }
    try {
      await playerService.seekTo(currentChapter?.chapter.start || 0);
      await seekTo(currentChapter?.chapter.start || 0);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to seek to start:', error);
    }
  }, [seekTo, currentChapter]);

  const handleNextChapter = useCallback(async () => {
    if (!currentChapter) {
      return;
    }
    try {
      await playerService.seekTo(currentChapter?.chapter.end || 0);
      await seekTo(currentChapter?.chapter.end || 0);
    } catch (error) {
      console.error('[FullScreenPlayer] Failed to seek to next chapter:', error);
    }
  }, [seekTo, currentChapter]);

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
          <View style={{
            width: coverSize,
            height: coverSize,
            borderRadius: 12,
            backgroundColor: isDark ? '#333' : '#f0f0f0',
            marginBottom: 24,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: {
              width: 0,
              height: 4,
            },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
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
                  fontSize: 48,
                  color: isDark ? '#666' : '#999',
                }}>
                  📚
                </Text>
              </View>
            )}
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
            {/* Start of track */}
            <TouchableOpacity
              style={{
                width: 60,
                height: 60,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={handleStartOfChapter}
            >
              <FontAwesome6 name="chevron-left" size={24} color={isDark ? 'white' : 'black'} />
            </TouchableOpacity>

            {/* Skip Backward */}
            <TouchableOpacity
              style={{
                width: 60,
                height: 60,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={handleSkipBackward}
            >
              <FontAwesome6 name="arrow-rotate-left" size={24} color={isDark ? 'white' : 'black'} />
              {/* <Text style={[styles.text, { fontSize: 10, opacity: 0.7 }]}>15s</Text> */}
            </TouchableOpacity>

            {/* Play/Pause */}
            <TouchableOpacity
              style={{
                width: 80,
                height: 80,
                justifyContent: 'center',
                alignItems: 'center',
                marginHorizontal: 32,
              }}
              onPress={handlePlayPause}
            >
              <FontAwesome6 name={isPlaying ? 'pause' : 'play'} size={32} color={isDark ? 'white' : 'black'} />
            </TouchableOpacity>

            {/* Skip Forward */}
            <TouchableOpacity
              style={{
                width: 60,
                height: 60,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={handleSkipForward}
            >
              <FontAwesome6 name="arrow-rotate-right" size={24} color={isDark ? 'white' : 'black'} />
              {/* <Text style={[styles.text, { fontSize: 10, opacity: 0.7 }]}>30s</Text> */}
            </TouchableOpacity>

            {/* Start of track */}
            <TouchableOpacity
              style={{
                width: 60,
                height: 60,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={handleNextChapter}
            >
              <FontAwesome6 name="chevron-right" size={24} color={isDark ? 'white' : 'black'} />
            </TouchableOpacity>

          </View>

          {/* Secondary Controls */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            {/* Playback Rate */}
            <View style={{ alignItems: 'center' }}>
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
            </View>

            {/* Volume */}
            <View style={{ alignItems: 'center', flex: 1, marginLeft: 32 }}>
              <Text style={[styles.text, { fontSize: 12, opacity: 0.7, marginBottom: 8 }]}>
                Volume
              </Text>
              {/* <Slider
                  style={{ width: '100%', height: 30 }}
                  minimumValue={0}
                  maximumValue={1}
                  value={volume}
                  onValueChange={handleVolumeChange}
                  minimumTrackTintColor="#007AFF"
                  maximumTrackTintColor={isDark ? '#333' : '#e0e0e0'}
                  thumbStyle={{
                    backgroundColor: '#007AFF',
                    width: 16,
                    height: 16,
                  }}
                /> */}
            </View>
          </View>
        </View>
      </View>

    </>
  );
}
