/**
 * Settings Screen
 *
 * User preferences and app settings
 */

import Toggle from '@/components/ui/Toggle';
import { useThemedStyles } from '@/lib/theme';
import { useLibrary, useSettings } from '@/stores';
import { MenuView } from '@react-native-menu/menu';
import { Stack } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90];

export default function SettingsScreen() {
  const { colors, isDark } = useThemedStyles();
  const {
    jumpForwardInterval,
    jumpBackwardInterval,
    smartRewindEnabled,
    backgroundServiceReconnection,
    isLoading,
    updateJumpForwardInterval,
    updateJumpBackwardInterval,
    updateSmartRewindEnabled,
    updateBackgroundServiceReconnection,
  } = useSettings();
  const { libraries, selectedLibrary, selectLibrary } = useLibrary();

  // Helper colors
  const textSecondary = isDark ? '#999999' : '#666666';
  const primaryColor = isDark ? '#4A9EFF' : '#007AFF';
  const cardBackground = isDark ? '#2C2C2E' : '#E5E5EA';

  // Toggle background service reconnection
  const toggleBackgroundServiceReconnection = useCallback(async (value: boolean) => {
    try {
      await updateBackgroundServiceReconnection(value);
    } catch (error) {
      console.error('Failed to update background service reconnection', error);
      Alert.alert('Error', 'Failed to save setting');
    }
  }, [updateBackgroundServiceReconnection]);

  // Update jump forward interval
  const handleJumpForwardChange = useCallback(async (seconds: number) => {
    try {
      await updateJumpForwardInterval(seconds);
    } catch (error) {
      console.error('Failed to update jump forward interval', error);
      Alert.alert('Error', 'Failed to save setting');
    }
  }, [updateJumpForwardInterval]);

  // Update jump backward interval
  const handleJumpBackwardChange = useCallback(async (seconds: number) => {
    try {
      await updateJumpBackwardInterval(seconds);
    } catch (error) {
      console.error('Failed to update jump backward interval', error);
      Alert.alert('Error', 'Failed to save setting');
    }
  }, [updateJumpBackwardInterval]);

  // Toggle smart rewind
  const toggleSmartRewind = useCallback(async (value: boolean) => {
    try {
      await updateSmartRewindEnabled(value);
    } catch (error) {
      console.error('Failed to update smart rewind setting', error);
      Alert.alert('Error', 'Failed to save setting');
    }
  }, [updateSmartRewindEnabled]);

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
        {/* Library Selection Section */}
        {libraries.length > 0 && (
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 12, textTransform: 'uppercase' }}>
              Library Selection
            </Text>
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 15, color: colors.textPrimary, fontWeight: '500', marginBottom: 8 }}>
                Current Library
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {libraries.map((library) => (
                  <Pressable
                    key={library.id}
                    onPress={() => selectLibrary(library.id)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: selectedLibrary?.id === library.id ? primaryColor : isDark ? '#3A3A3C' : '#C7C7CC',
                      backgroundColor: selectedLibrary?.id === library.id ? primaryColor : isDark ? '#1C1C1E' : '#FFFFFF',
                    }}
                  >
                    <Text style={{ color: selectedLibrary?.id === library.id ? '#FFFFFF' : colors.textPrimary, fontWeight: '600' }}>
                      {library.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Playback Controls Section */}
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 12, textTransform: 'uppercase' }}>
            Playback Controls
          </Text>

          {/* Jump Forward Interval */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 15, color: colors.textPrimary, fontWeight: '500', marginBottom: 8 }}>
              Jump Forward Interval
            </Text>
            <MenuView
              onPressAction={({ nativeEvent }) => {
                handleJumpForwardChange(parseInt(nativeEvent.event as string, 10));
              }}
              actions={INTERVAL_OPTIONS.map((seconds) => ({
                id: seconds.toString(),
                title: `${seconds}s`,
                state: jumpForwardInterval === seconds ? 'on' : 'off',
              }))}
            >
              <Pressable>
                <Text style={{ color: colors.link, fontSize: 15, textDecorationLine: 'underline' }}>
                  {jumpForwardInterval}s
                </Text>
              </Pressable>
            </MenuView>
          </View>

          {/* Jump Backward Interval */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 15, color: colors.textPrimary, fontWeight: '500', marginBottom: 8 }}>
              Jump Backward Interval
            </Text>
            <MenuView
              onPressAction={({ nativeEvent }) => {
                handleJumpBackwardChange(parseInt(nativeEvent.event as string, 10));
              }}
              actions={INTERVAL_OPTIONS.map((seconds) => ({
                id: seconds.toString(),
                title: `${seconds}s`,
                state: jumpBackwardInterval === seconds ? 'on' : 'off',
              }))}
            >
              <Pressable>
                <Text style={{ color: colors.link, fontSize: 15, textDecorationLine: 'underline' }}>
                  {jumpBackwardInterval}s
                </Text>
              </Pressable>
            </MenuView>
          </View>

          {/* Smart Rewind Toggle */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
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
      </ScrollView>
    </>
  );
}
