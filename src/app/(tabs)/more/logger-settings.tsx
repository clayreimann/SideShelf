/**
 * Logger Settings Screen - Manage logger tag enable/disable
 *
 * This screen allows users to enable or disable specific logger tags
 * to reduce noise during development and debugging.
 */

import { getAllTags, logger } from '@/lib/logger';
import { useThemedStyles } from '@/lib/theme';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

// Create cached sublogger for this screen
const log = logger.forTag('LoggerSettingsScreen');

export default function LoggerSettingsScreen() {
  const { styles, colors, isDark } = useThemedStyles();
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [disabledTags, setDisabledTags] = useState<string[]>([]);

  // Helper colors
  const textSecondary = isDark ? '#999999' : '#666666';
  const primaryColor = isDark ? '#4A9EFF' : '#007AFF';
  const cardBackground = isDark ? '#2C2C2E' : '#E5E5EA';

  // Load tags
  const loadTags = useCallback(() => {
    try {
      const tags = getAllTags();
      setAvailableTags(tags);
      const disabled = logger.getDisabledTags();
      setDisabledTags(disabled);
    } catch (error) {
      log.error('Failed to load tags', error as Error);
      Alert.alert('Error', 'Failed to load tags');
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Toggle tag enabled/disabled
  const toggleTagEnabled = useCallback((tag: string) => {
    if (disabledTags.includes(tag)) {
      logger.enableTag(tag);
      setDisabledTags(prev => prev.filter(t => t !== tag));
    } else {
      logger.disableTag(tag);
      setDisabledTags(prev => [...prev, tag]);
    }
  }, [disabledTags]);

  // Enable all tags
  const handleEnableAll = useCallback(() => {
    logger.enableAllTags();
    setDisabledTags([]);
  }, []);

  // Disable all tags
  const handleDisableAll = useCallback(() => {
    availableTags.forEach(tag => logger.disableTag(tag));
    setDisabledTags([...availableTags]);
  }, [availableTags]);

  // Render tag item
  const renderTagItem = ({ item: tag }: { item: string }) => {
    const isEnabled = !disabledTags.includes(tag);
    return (
      <Pressable
        onPress={() => toggleTagEnabled(tag)}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? '#2C2C2E' : '#E5E5EA',
        }}
      >
        <Text style={{ fontSize: 15, color: colors.textPrimary, flex: 1 }}>{tag}</Text>
        <View
          style={{
            width: 51,
            height: 31,
            borderRadius: 15.5,
            backgroundColor: isEnabled ? primaryColor : isDark ? '#3A3A3C' : '#C7C7CC',
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
              alignSelf: isEnabled ? 'flex-end' : 'flex-start',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 3,
              elevation: 3,
            }}
          />
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Logger Settings' }} />

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Description */}
        <View style={{ padding: 16, backgroundColor: cardBackground }}>
          <Text style={{ fontSize: 14, color: textSecondary, lineHeight: 20 }}>
            Disable tags to stop them from logging. This is useful for reducing noise during development
            and focusing on specific components. Changes take effect immediately.
          </Text>
        </View>

        {/* Status */}
        <View style={{ padding: 12, backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }}>
          <Text style={{ fontSize: 13, color: textSecondary, textAlign: 'center' }}>
            {availableTags.length - disabledTags.length} of {availableTags.length} tags enabled
            {disabledTags.length > 0 && ` · ${disabledTags.length} disabled`}
          </Text>
        </View>

        {/* Tags list */}
        <FlatList
          data={availableTags}
          renderItem={renderTagItem}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: textSecondary }}>
                No tags found. Tags appear after the app creates logs.
              </Text>
            </View>
          }
        />

        {/* Action buttons */}
        {availableTags.length > 0 && (
          <View
            style={{
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: isDark ? '#2C2C2E' : '#E5E5EA',
              backgroundColor: colors.background,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={handleEnableAll}
                disabled={disabledTags.length === 0}
                style={{
                  flex: 1,
                  backgroundColor: disabledTags.length === 0 ? cardBackground : primaryColor,
                  borderRadius: 10,
                  paddingVertical: 12,
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    color: disabledTags.length === 0 ? textSecondary : '#FFFFFF',
                    fontWeight: '600',
                    fontSize: 16,
                  }}
                >
                  Enable All
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDisableAll}
                disabled={disabledTags.length === availableTags.length}
                style={{
                  flex: 1,
                  backgroundColor:
                    disabledTags.length === availableTags.length ? cardBackground : isDark ? '#FF453A' : '#FF3B30',
                  borderRadius: 10,
                  paddingVertical: 12,
                }}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    color: disabledTags.length === availableTags.length ? textSecondary : '#FFFFFF',
                    fontWeight: '600',
                    fontSize: 16,
                  }}
                >
                  Disable All
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </>
  );
}
