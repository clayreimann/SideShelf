/**
 * Logs Screen - View and export application logs
 *
 * This screen displays all application logs stored in the SQLite database,
 * allowing users to filter by level, search, export, and clear logs.
 */

import { getAllLogs, getLogsByLevel, logger, type LogRow } from '@/lib/logger';
import { useThemedStyles } from '@/lib/theme';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';

type LogLevel = 'all' | 'debug' | 'info' | 'warn' | 'error';

export default function LogsScreen() {
  const { styles, colors, isDark } = useThemedStyles();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogRow[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>('all');
  const [searchText, setSearchText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Load logs
  const loadLogs = useCallback(() => {
    setIsLoading(true);
    try {
      let loadedLogs: LogRow[];
      if (selectedLevel === 'all') {
        loadedLogs = getAllLogs();
      } else {
        loadedLogs = getLogsByLevel(selectedLevel);
      }
      setLogs(loadedLogs);
    } catch (error) {
      console.error('[LogsScreen] Failed to load logs:', error);
      Alert.alert('Error', 'Failed to load logs');
    } finally {
      setIsLoading(false);
    }
  }, [selectedLevel]);

  // Filter logs based on search text
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredLogs(logs);
      return;
    }

    const lowercaseSearch = searchText.toLowerCase();
    const filtered = logs.filter(
      (log) =>
        log.message.toLowerCase().includes(lowercaseSearch) ||
        log.tag.toLowerCase().includes(lowercaseSearch)
    );
    setFilteredLogs(filtered);
  }, [logs, searchText]);

  // Load logs on mount and when filter changes
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Clear all logs
  const handleClearLogs = useCallback(() => {
    Alert.alert('Clear All Logs', 'Are you sure you want to clear all logs?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          try {
            logger.clearLogs();
            setLogs([]);
            setFilteredLogs([]);
            Alert.alert('Success', 'All logs cleared');
          } catch (error) {
            console.error('[LogsScreen] Failed to clear logs:', error);
            Alert.alert('Error', 'Failed to clear logs');
          }
        },
      },
    ]);
  }, []);

  // Export logs to clipboard
  const handleExportLogs = useCallback(() => {
    try {
      const exportText = filteredLogs
        .map((log) => {
          const timestamp = log.timestamp instanceof Date ? log.timestamp.toISOString() : new Date(log.timestamp).toISOString();
          return `[${timestamp}] [${log.level.toUpperCase()}] [${log.tag}] ${log.message}`;
        })
        .join('\n');

      Clipboard.setStringAsync(exportText);
      Alert.alert('Success', 'Logs copied to clipboard');
    } catch (error) {
      console.error('[LogsScreen] Failed to export logs:', error);
      Alert.alert('Error', 'Failed to export logs');
    }
  }, [filteredLogs]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (filteredLogs.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [filteredLogs]);

  // Get color for log level
  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'debug':
        return isDark ? '#8B8B8B' : '#666666';
      case 'info':
        return isDark ? '#4A9EFF' : '#007AFF';
      case 'warn':
        return isDark ? '#FFB340' : '#FF9500';
      case 'error':
        return isDark ? '#FF453A' : '#FF3B30';
      default:
        return colors.text;
    }
  };

  // Render log item
  const renderLogItem = ({ item }: { item: LogRow }) => {
    const timestamp = new Date(item.timestamp);
    const timeStr = timestamp.toLocaleTimeString();
    const dateStr = timestamp.toLocaleDateString();
    const levelColor = getLevelColor(item.level);

    return (
      <View
        style={{
          padding: 12,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? '#2C2C2E' : '#E5E5EA',
        }}
      >
        {/* Header: timestamp and level */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary, marginRight: 8 }}>
            {dateStr} {timeStr}
          </Text>
          <View
            style={{
              backgroundColor: levelColor + '20',
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '600', color: levelColor }}>
              {item.level.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Tag */}
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text, marginBottom: 2 }}>
          {item.tag}
        </Text>

        {/* Message */}
        <Text style={{ fontSize: 13, color: colors.text, fontFamily: 'monospace' }}>
          {item.message}
        </Text>
      </View>
    );
  };

  // Render level filter button
  const renderLevelButton = (level: LogLevel, label: string) => {
    const isSelected = selectedLevel === level;
    return (
      <Pressable
        onPress={() => setSelectedLevel(level)}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 16,
          backgroundColor: isSelected ? colors.primary : isDark ? '#2C2C2E' : '#E5E5EA',
          marginRight: 8,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: isSelected ? '600' : '400',
            color: isSelected ? '#FFFFFF' : colors.text,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Logs' }} />

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Search and filter controls */}
        <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: isDark ? '#2C2C2E' : '#E5E5EA' }}>
          {/* Search input */}
          <TextInput
            style={{
              backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7',
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              color: colors.text,
              marginBottom: 12,
            }}
            placeholder="Search logs..."
            placeholderTextColor={colors.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
          />

          {/* Level filter buttons */}
          <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            {renderLevelButton('all', 'All')}
            {renderLevelButton('debug', 'Debug')}
            {renderLevelButton('info', 'Info')}
            {renderLevelButton('warn', 'Warn')}
            {renderLevelButton('error', 'Error')}
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable
              onPress={loadLogs}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA',
                borderRadius: 8,
                paddingVertical: 10,
                marginRight: 6,
              }}
            >
              <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '600' }}>
                Refresh
              </Text>
            </Pressable>

            <Pressable
              onPress={scrollToBottom}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#2C2C2E' : '#E5E5EA',
                borderRadius: 8,
                paddingVertical: 10,
                marginRight: 6,
              }}
            >
              <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '600' }}>
                Latest
              </Text>
            </Pressable>

            <Pressable
              onPress={handleExportLogs}
              style={{
                flex: 1,
                backgroundColor: colors.primary,
                borderRadius: 8,
                paddingVertical: 10,
                marginRight: 6,
              }}
            >
              <Text style={{ textAlign: 'center', color: '#FFFFFF', fontWeight: '600' }}>
                Export
              </Text>
            </Pressable>

            <Pressable
              onPress={handleClearLogs}
              style={{
                flex: 1,
                backgroundColor: isDark ? '#FF453A' : '#FF3B30',
                borderRadius: 8,
                paddingVertical: 10,
              }}
            >
              <Text style={{ textAlign: 'center', color: '#FFFFFF', fontWeight: '600' }}>
                Clear
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Logs count */}
        <View style={{ padding: 8, backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
            {filteredLogs.length} {filteredLogs.length === 1 ? 'log' : 'logs'}
            {searchText.trim() && ` (filtered from ${logs.length})`}
          </Text>
        </View>

        {/* Logs list */}
        <FlatList
          ref={flatListRef}
          data={filteredLogs}
          renderItem={renderLogItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshing={isLoading}
          onRefresh={loadLogs}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: colors.textSecondary }}>No logs found</Text>
            </View>
          }
        />
      </View>
    </>
  );
}
