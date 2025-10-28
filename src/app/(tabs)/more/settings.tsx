/**
 * Settings Screen
 *
 * User preferences and app settings
 */

import Toggle from '@/components/ui/Toggle';
import {
  getBackgroundServiceReconnectionEnabled,
  getJumpBackwardInterval,
  getJumpForwardInterval,
  getSmartRewindEnabled,
  setBackgroundServiceReconnectionEnabled,
  setJumpBackwardInterval,
  setJumpForwardInterval,
  setSmartRewindEnabled,
} from '@/lib/appSettings';
import { logger } from '@/lib/logger';
import { useThemedStyles } from '@/lib/theme';
import { playerService } from '@/services/PlayerService';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

const log = logger.forTag('SettingsScreen');

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90];

export default function SettingsScreen() {
  const { colors, isDark } = useThemedStyles();
  const [backgroundServiceReconnection, setBackgroundServiceReconnection] = useState<boolean>(true);
  const [jumpForwardInterval, setJumpForwardIntervalState] = useState<number>(30);
  const [jumpBackwardInterval, setJumpBackwardIntervalState] = useState<number>(15);
  const [smartRewindEnabled, setSmartRewindEnabledState] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Helper colors
  const textSecondary = isDark ? '#999999' : '#666666';
  const primaryColor = isDark ? '#4A9EFF' : '#007AFF';
  const cardBackground = isDark ? '#2C2C2E' : '#E5E5EA';

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [reconnection, forward, backward, smartRewind] = await Promise.all([
          getBackgroundServiceReconnectionEnabled(),
          getJumpForwardInterval(),
          getJumpBackwardInterval(),
          getSmartRewindEnabled(),
        ]);
        setBackgroundServiceReconnection(reconnection);
        setJumpForwardIntervalState(forward);
        setJumpBackwardIntervalState(backward);
        setSmartRewindEnabledState(smartRewind);
      } catch (error) {
        log.error('Failed to load settings', error as Error);
        Alert.alert('Error', 'Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Toggle background service reconnection
  const toggleBackgroundServiceReconnection = useCallback(async (value: boolean) => {
    setBackgroundServiceReconnection(value);
    try {
      await setBackgroundServiceReconnectionEnabled(value);
      log.info(`Background service reconnection ${value ? 'enabled' : 'disabled'}`);
    } catch (error) {
      log.error('Failed to save setting', error as Error);
      Alert.alert('Error', 'Failed to save setting');
      setBackgroundServiceReconnection(!value);
    }
  }, []);

  // Update jump forward interval
  const handleJumpForwardChange = useCallback(async (seconds: number) => {
    setJumpForwardIntervalState(seconds);
    try {
      await setJumpForwardInterval(seconds);
      // Reconfigure TrackPlayer with new interval
      await playerService.configureTrackPlayer();
      log.info(`Jump forward interval set to ${seconds}s`);
    } catch (error) {
      log.error('Failed to save jump forward interval', error as Error);
      Alert.alert('Error', 'Failed to save setting');
    }
  }, []);

  // Update jump backward interval
  const handleJumpBackwardChange = useCallback(async (seconds: number) => {
    setJumpBackwardIntervalState(seconds);
    try {
      await setJumpBackwardInterval(seconds);
      // Reconfigure TrackPlayer with new interval
      await playerService.configureTrackPlayer();
      log.info(`Jump backward interval set to ${seconds}s`);
    } catch (error) {
      log.error('Failed to save jump backward interval', error as Error);
      Alert.alert('Error', 'Failed to save setting');
    }
  }, []);

  // Toggle smart rewind
  const toggleSmartRewind = useCallback(async (value: boolean) => {
    setSmartRewindEnabledState(value);
    try {
      await setSmartRewindEnabled(value);
      log.info(`Smart rewind ${value ? 'enabled' : 'disabled'}`);
    } catch (error) {
      log.error('Failed to save smart rewind setting', error as Error);
      Alert.alert('Error', 'Failed to save setting');
      setSmartRewindEnabledState(!value);
    }
  }, []);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Settings' }} />
        <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: textSecondary }}>Loading settings...</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Settings' }} />

      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Playback Controls Section */}
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 12, textTransform: 'uppercase' }}>
            Playback Controls
          </Text>

          {/* Jump Forward Interval */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, color: colors.textPrimary, fontWeight: '500', marginBottom: 8 }}>
              Jump Forward Interval
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {INTERVAL_OPTIONS.map((seconds) => (
                <Pressable
                  key={`forward-${seconds}`}
                  onPress={() => handleJumpForwardChange(seconds)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: jumpForwardInterval === seconds ? primaryColor : isDark ? '#3A3A3C' : '#C7C7CC',
                    backgroundColor: jumpForwardInterval === seconds ? primaryColor : isDark ? '#1C1C1E' : '#FFFFFF',
                  }}
                >
                  <Text style={{ color: jumpForwardInterval === seconds ? '#FFFFFF' : colors.textPrimary, fontWeight: '600' }}>
                    {seconds}s
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Jump Backward Interval */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 15, color: colors.textPrimary, fontWeight: '500', marginBottom: 8 }}>
              Jump Backward Interval
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {INTERVAL_OPTIONS.map((seconds) => (
                <Pressable
                  key={`backward-${seconds}`}
                  onPress={() => handleJumpBackwardChange(seconds)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: jumpBackwardInterval === seconds ? primaryColor : isDark ? '#3A3A3C' : '#C7C7CC',
                    backgroundColor: jumpBackwardInterval === seconds ? primaryColor : isDark ? '#1C1C1E' : '#FFFFFF',
                  }}
                >
                  <Text style={{ color: jumpBackwardInterval === seconds ? '#FFFFFF' : colors.textPrimary, fontWeight: '600' }}>
                    {seconds}s
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Smart Rewind Toggle */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderRadius: 10,
          }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 15, color: colors.textPrimary, fontWeight: '500', marginBottom: 4 }}>
                Smart Rewind on Resume
              </Text>
              <Text style={{ fontSize: 13, color: textSecondary, lineHeight: 18 }}>
                Automatically rewind a few seconds when resuming playback after a pause. The rewind time increases based on how long playback was paused (3s to 30s).
              </Text>
            </View>
            <Toggle value={smartRewindEnabled} onValueChange={toggleSmartRewind} />
          </View>
        </View>

        {/* Advanced Settings Section */}
        <View style={{ padding: 16, marginTop: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 12, textTransform: 'uppercase' }}>
            Advanced
          </Text>

          {/* Background Service Reconnection Toggle */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderRadius: 10,
          }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 15, color: colors.textPrimary, fontWeight: '500', marginBottom: 4 }}>
                Auto-reconnect Background Service
              </Text>
              <Text style={{ fontSize: 13, color: textSecondary, lineHeight: 18 }}>
                Automatically reconnect the audio player background service when the app returns from background or after context recreation. Disable if experiencing issues with playback.
              </Text>
            </View>
            <Toggle value={backgroundServiceReconnection} onValueChange={toggleBackgroundServiceReconnection} />
          </View>
        </View>

        {/* Info Section */}
        <View style={{ padding: 16, backgroundColor: cardBackground, marginTop: 24 }}>
          <Text style={{ fontSize: 14, color: textSecondary, lineHeight: 20 }}>
            These settings control how the app manages audio playback. Changes take effect immediately.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}
