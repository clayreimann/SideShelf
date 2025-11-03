/**
 * Logger Settings Screen - Manage logger tag enable/disable and log levels
 *
 * This screen allows users to enable or disable specific logger tags
 * and configure log levels per tag to reduce noise during development and debugging.
 */

import Toggle from '@/components/ui/Toggle';
import { formatBytes } from '@/lib/helpers/formatters';
import { getAllTags, getDatabaseSize, logger, type LogLevel } from '@/lib/logger';
import { useThemedStyles } from '@/lib/theme';
import { MenuView } from '@react-native-menu/menu';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

// Create cached sublogger for this screen
const log = logger.forTag('LoggerSettingsScreen');

const RETENTION_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '6 hours', hours: 6 },
  { label: '12 hours', hours: 12 },
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
];

const LOG_LEVELS: Array<{ label: string; value: LogLevel | 'default' }> = [
  { label: 'Default', value: 'default' },
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' },
];

export default function LoggerSettingsScreen() {
  const { colors, isDark } = useThemedStyles();
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [disabledTags, setDisabledTags] = useState<string[]>([]);
  const [tagLevels, setTagLevels] = useState<Record<string, LogLevel | 'default'>>({});
  const [retentionHours, setRetentionHours] = useState<number>(() => logger.getRetentionDurationHours());
  const [isUpdatingRetention, setIsUpdatingRetention] = useState<boolean>(false);
  const [defaultLogLevel, setDefaultLogLevel] = useState<LogLevel>(() => logger.getDefaultLogLevel());
  const [isUpdatingDefaultLevel, setIsUpdatingDefaultLevel] = useState<boolean>(false);
  const [dbSize, setDbSize] = useState<number>(0);

  // Helper colors
  const textSecondary = isDark ? '#999999' : '#666666';
  const primaryColor = isDark ? '#4A9EFF' : '#007AFF';
  const cardBackground = isDark ? '#2C2C2E' : '#E5E5EA';

  // Load tags and retention preference
  const loadLoggerSettings = useCallback(() => {
    try {
      const disabled = logger.getDisabledTags();
      setDisabledTags(disabled);
      const tags = getAllTags();
      setAvailableTags([...tags, ...disabled.filter(t => !tags.includes(t))].sort());
      setRetentionHours(logger.getRetentionDurationHours());
      setDefaultLogLevel(logger.getDefaultLogLevel());

      // Load tag levels
      const levels = logger.getAllTagLevels();
      const levelsWithDefaults: Record<string, LogLevel | 'default'> = {};
      tags.forEach(tag => {
        levelsWithDefaults[tag] = levels[tag] || 'default';
      });
      setTagLevels(levelsWithDefaults);

      // Load database size
      const size = getDatabaseSize();
      setDbSize(size);
    } catch (error) {
      log.error('Failed to load logger settings', error as Error);
      Alert.alert('Error', 'Failed to load logger settings');
    }
  }, []);

  useEffect(() => {
    loadLoggerSettings();
  }, [loadLoggerSettings]);

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

  // Handle log level change for a tag
  const handleLogLevelChange = useCallback(async (tag: string, level: LogLevel | 'default') => {
    try {
      if (level === 'default') {
        await logger.clearTagLevel(tag);
        setTagLevels(prev => ({ ...prev, [tag]: 'default' }));
      } else {
        await logger.setTagLevel(tag, level);
        setTagLevels(prev => ({ ...prev, [tag]: level }));
      }
    } catch (error) {
      log.error(`Failed to set log level for tag "${tag}"`, error as Error);
      Alert.alert('Error', `Failed to set log level for tag "${tag}"`);
    }
  }, []);

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

  const handleRetentionChange = useCallback(async (hours: number) => {
    if (hours === retentionHours || isUpdatingRetention) {
      return;
    }

    setIsUpdatingRetention(true);
    try {
      await logger.setRetentionDurationHours(hours);
      setRetentionHours(hours);
    } catch (error) {
      log.error('Failed to update retention', error as Error);
      Alert.alert('Error', 'Failed to update log retention');
    } finally {
      setIsUpdatingRetention(false);
    }
  }, [isUpdatingRetention, retentionHours]);

  const handleDefaultLogLevelChange = useCallback(async (level: LogLevel) => {
    if (level === defaultLogLevel || isUpdatingDefaultLevel) {
      return;
    }

    setIsUpdatingDefaultLevel(true);
    try {
      await logger.setDefaultLogLevel(level);
      setDefaultLogLevel(level);
    } catch (error) {
      log.error('Failed to update default log level', error as Error);
      Alert.alert('Error', 'Failed to update default log level');
    } finally {
      setIsUpdatingDefaultLevel(false);
    }
  }, [isUpdatingDefaultLevel, defaultLogLevel]);

  // Render default log level row
  const renderDefaultLogLevelRow = () => {
    const levelLabel = LOG_LEVELS.find(l => l.value === defaultLogLevel)?.label || 'Info';
    return (
      <View
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
        <Text style={{ fontSize: 15, color: colors.textPrimary }}>Default Log Level</Text>
        <MenuView
          onPressAction={({ nativeEvent }) => {
            const selectedLevel = nativeEvent.event as LogLevel;
            handleDefaultLogLevelChange(selectedLevel);
          }}
          actions={LOG_LEVELS.filter(level => level.value !== 'default').map((level) => ({
            id: level.value,
            title: level.label,
            state: defaultLogLevel === level.value ? 'on' : 'off',
          }))}
        >
          <Pressable>
            <Text style={{ fontSize: 15, color: colors.link, textDecorationLine: 'underline' }}>
              {levelLabel}
            </Text>
          </Pressable>
        </MenuView>
      </View>
    );
  };

  // Render retention row
  const renderRetentionRow = () => {
    const currentRetention = RETENTION_OPTIONS.find(o => o.hours === retentionHours);
    return (
      <View
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
        <Text style={{ fontSize: 15, color: colors.textPrimary }}>Log Retention</Text>
        <MenuView
          onPressAction={({ nativeEvent }) => {
            const selectedHours = parseInt(nativeEvent.event as string, 10);
            handleRetentionChange(selectedHours);
          }}
          actions={RETENTION_OPTIONS.map((option) => ({
            id: option.hours.toString(),
            title: option.label,
            state: retentionHours === option.hours ? 'on' : 'off',
          }))}
        >
          <Pressable>
            <Text style={{ fontSize: 15, color: colors.link, textDecorationLine: 'underline' }}>
              {currentRetention?.label || 'Not set'}
            </Text>
          </Pressable>
        </MenuView>
      </View>
    );
  };

  // Render tag item
  const renderTagItem = ({ item: tag }: { item: string }) => {
    const isEnabled = !disabledTags.includes(tag);
    const currentLevel = tagLevels[tag] || 'default';
    const levelLabel = LOG_LEVELS.find(l => l.value === currentLevel)?.label || 'Default';

    return (
      <View
        style={{
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? '#2C2C2E' : '#E5E5EA',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <Text style={{ fontSize: 15, color: colors.textPrimary, flex: 1 }}>{tag}</Text>

          <MenuView
            onPressAction={({ nativeEvent }) => {
              const selectedLevel = nativeEvent.event as LogLevel | 'default';
              handleLogLevelChange(tag, selectedLevel);
            }}
            actions={LOG_LEVELS.map((level) => ({
              id: level.value,
              title: level.label,
              state: currentLevel === level.value ? 'on' : 'off',
            }))}
          >
            <Pressable style={{ marginRight: 16 }}>
              <Text style={{ fontSize: 15, color: colors.link, textDecorationLine: 'underline' }}>
                {levelLabel}
              </Text>
            </Pressable>
          </MenuView>

          <Toggle value={isEnabled} onValueChange={() => toggleTagEnabled(tag)} />
        </View>
      </View>
    );
  };

  // Render list header
  const renderListHeader = () => (
    <View>
      <View style={{ padding: 12, backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }}>
        <Text style={{ fontSize: 13, color: textSecondary, textAlign: 'center' }}>
          {availableTags.length - disabledTags.length} of {availableTags.length} tags enabled
          {disabledTags.length > 0 && ` · ${disabledTags.length} disabled`}
          {dbSize > 0 && ` · DB: ${formatBytes(dbSize)}`}
        </Text>
      </View>

      {/* Enable/Disable All buttons */}
      {availableTags.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#2C2C2E' : '#E5E5EA',
          }}
        >
          <Pressable
            onPress={handleEnableAll}
            disabled={disabledTags.length === 0}
            style={{
              flex: 1,
              backgroundColor: disabledTags.length === 0 ? cardBackground : primaryColor,
              borderRadius: 8,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                textAlign: 'center',
                color: disabledTags.length === 0 ? textSecondary : '#FFFFFF',
                fontWeight: '600',
                fontSize: 14,
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
              borderRadius: 8,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                textAlign: 'center',
                color: disabledTags.length === availableTags.length ? textSecondary : '#FFFFFF',
                fontWeight: '600',
                fontSize: 14,
              }}
            >
              Disable All
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Logger Settings' }} />

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <FlatList
          data={availableTags}
          renderItem={renderTagItem}
          keyExtractor={(item) => item}
          ListHeaderComponent={
            <View>
              {renderListHeader()}
              {renderDefaultLogLevelRow()}
              {renderRetentionRow()}
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: textSecondary }}>
                No tags found. Tags appear after the app creates logs.
              </Text>
            </View>
          }
        />
      </View>
    </>
  );
}
