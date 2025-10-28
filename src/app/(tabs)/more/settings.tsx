/**
 * Settings Screen
 *
 * User preferences and app settings
 */

import {
  getBackgroundServiceReconnectionEnabled,
  setBackgroundServiceReconnectionEnabled,
} from '@/lib/appSettings';
import { logger } from '@/lib/logger';
import { useThemedStyles } from '@/lib/theme';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

const log = logger.forTag('SettingsScreen');

export default function SettingsScreen() {
  const { colors, isDark } = useThemedStyles();
  const [backgroundServiceReconnection, setBackgroundServiceReconnection] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Helper colors
  const textSecondary = isDark ? '#999999' : '#666666';
  const primaryColor = isDark ? '#4A9EFF' : '#007AFF';
  const cardBackground = isDark ? '#2C2C2E' : '#E5E5EA';

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const enabled = await getBackgroundServiceReconnectionEnabled();
        setBackgroundServiceReconnection(enabled);
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
  const toggleBackgroundServiceReconnection = useCallback(async () => {
    const newValue = !backgroundServiceReconnection;
    setBackgroundServiceReconnection(newValue);

    try {
      await setBackgroundServiceReconnectionEnabled(newValue);
      log.info(`Background service reconnection ${newValue ? 'enabled' : 'disabled'}`);
    } catch (error) {
      log.error('Failed to save setting', error as Error);
      Alert.alert('Error', 'Failed to save setting');
      // Revert on error
      setBackgroundServiceReconnection(!newValue);
    }
  }, [backgroundServiceReconnection]);

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
        {/* Player Settings Section */}
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 12, textTransform: 'uppercase' }}>
            Player Settings
          </Text>

          {/* Background Service Reconnection Toggle */}
          <Pressable
            onPress={toggleBackgroundServiceReconnection}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              borderRadius: 10,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 15, color: colors.textPrimary, fontWeight: '500', marginBottom: 4 }}>
                Auto-reconnect Background Service
              </Text>
              <Text style={{ fontSize: 13, color: textSecondary, lineHeight: 18 }}>
                Automatically reconnect the audio player background service when the app returns from background or after context recreation. Disable if experiencing issues with playback.
              </Text>
            </View>
            <View
              style={{
                width: 51,
                height: 31,
                borderRadius: 15.5,
                backgroundColor: backgroundServiceReconnection ? primaryColor : isDark ? '#3A3A3C' : '#C7C7CC',
                justifyContent: 'center',
                paddingHorizontal: 2,
              }}
            >
              <View
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: 13.5,
                  backgroundColor: '#FFFFFF',
                  alignSelf: backgroundServiceReconnection ? 'flex-end' : 'flex-start',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.3,
                  shadowRadius: 3,
                  elevation: 3,
                }}
              />
            </View>
          </Pressable>
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
