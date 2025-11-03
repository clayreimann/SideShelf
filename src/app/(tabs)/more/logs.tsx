/**
 * Logs Screen - View and export application logs
 *
 * This screen displays all application logs stored in the SQLite database,
 * allowing users to filter by level, search, export, and clear logs.
 */

import {
  getAllLogs,
  getAllTags,
  getLogsByLevel,
  logger,
  type LogRow,
} from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { useAppStore } from "@/stores/appStore";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { Stack, router } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type LogLevel = "all" | "debug" | "info" | "warn" | "error";

// Maximum length for log messages in the UI (prevent overwhelming rendering)
const MAX_LOG_MESSAGE_LENGTH = 1000;

// Create cached sublogger for this screen
const log = logger.forTag("LogsScreen");

// ============================================================================
// Interfaces
// ============================================================================

interface ThemeColors {
  textPrimary: string;
  background: string;
  textSecondary: string;
  primaryColor: string;
  inputBackground: string;
  cardBackground: string;
  dangerColor: string;
  borderColor: string;
}

interface LogItemProps {
  item: LogRow;
  colors: ThemeColors;
  isDark: boolean;
}

interface FilterButtonProps {
  level: LogLevel;
  label: string;
  isSelected: boolean;
  onPress: () => void;
  colors: ThemeColors;
}

interface TagButtonProps {
  tag: string;
  isVisible: boolean;
  onPress: () => void;
  colors: ThemeColors;
}

interface ActionButtonsProps {
  onRefresh: () => void;
  onScrollToBottom: () => void;
  onClear: () => void;
  onCopyToClipboard: () => void;
  onShareFile: () => void;
  colors: ThemeColors;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Truncate a log message to a maximum length
 * @param message - The log message to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated message with indicator if truncated
 */
function truncateLogMessage(message: string, maxLength: number = MAX_LOG_MESSAGE_LENGTH): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength) + `... (${message.length - maxLength} more chars)`;
}

// ============================================================================
// Subcomponents
// ============================================================================

const LogItem: React.FC<LogItemProps> = React.memo(({ item, colors, isDark }) => {
  const timestamp = new Date(item.timestamp);

  // Format time with milliseconds as decimal: HH:MM:SS.mmm
  const hours = timestamp.getHours().toString().padStart(2, "0");
  const minutes = timestamp.getMinutes().toString().padStart(2, "0");
  const seconds = timestamp.getSeconds().toString().padStart(2, "0");
  const millis = timestamp.getMilliseconds().toString().padStart(3, "0");
  const timeStr = `${hours}:${minutes}:${seconds}.${millis}`;
  const dateStr = timestamp.toLocaleDateString();

  const levelColor = useMemo(() => {
    switch (item.level) {
      case "debug":
        return isDark ? "#8B8B8B" : "#666666";
      case "info":
        return isDark ? "#4A9EFF" : "#007AFF";
      case "warn":
        return isDark ? "#FFB340" : "#FF9500";
      case "error":
        return isDark ? "#FF453A" : "#FF3B30";
      default:
        return colors.textPrimary;
    }
  }, [item.level, isDark, colors.textPrimary]);

  return (
    <View style={[localStyles.logItem, { borderBottomColor: colors.borderColor }]}>
      <View style={localStyles.logHeader}>
        <Text style={[localStyles.logTag, { color: colors.textPrimary }]}>
          {item.tag}
        </Text>
        <View style={[localStyles.logLevelBadge, { backgroundColor: levelColor + "20" }]}>
          <Text style={[localStyles.logLevelText, { color: levelColor }]}>
            {item.level.toUpperCase()}
          </Text>
        </View>
        <Text style={[localStyles.logTimestamp, { color: colors.textSecondary }]}>
          {dateStr} {timeStr}
        </Text>
      </View>
      <Text style={[localStyles.logMessage, { color: colors.textPrimary }]}>
        {truncateLogMessage(item.message)}
      </Text>
    </View>
  );
});

LogItem.displayName = "LogItem";

const FilterButton: React.FC<FilterButtonProps> = React.memo(
  ({ level, label, isSelected, onPress, colors }) => {
    return (
      <Pressable
        onPress={onPress}
        style={[
          localStyles.filterButton,
          {
            backgroundColor: isSelected ? colors.primaryColor : colors.cardBackground,
          },
        ]}
      >
        <Text
          style={[
            localStyles.filterButtonText,
            {
              fontWeight: isSelected ? "600" : "400",
              color: isSelected ? "#FFFFFF" : colors.textPrimary,
            },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  }
);

FilterButton.displayName = "FilterButton";

const TagButton: React.FC<TagButtonProps> = React.memo(
  ({ tag, isVisible, onPress, colors }) => {
    return (
      <Pressable
        onPress={onPress}
        style={[
          localStyles.tagButton,
          {
            backgroundColor: isVisible ? colors.primaryColor : colors.cardBackground,
            opacity: isVisible ? 1 : 0.5,
          },
        ]}
      >
        <Text
          style={[
            localStyles.tagButtonText,
            {
              fontWeight: isVisible ? "600" : "400",
              color: isVisible ? "#FFFFFF" : colors.textPrimary,
            },
          ]}
        >
          {isVisible ? "✓ " : ""}
          {tag}
        </Text>
      </Pressable>
    );
  }
);

TagButton.displayName = "TagButton";

const ActionButtons: React.FC<ActionButtonsProps> = React.memo(
  ({ onRefresh, onScrollToBottom, onClear, onCopyToClipboard, onShareFile, colors }) => {
    return (
      <>
        {/* Row 1: Refresh, Latest, Clear */}
        <View style={localStyles.actionButtonRow}>
          <Pressable
            onPress={onRefresh}
            style={[localStyles.actionButton, { backgroundColor: colors.cardBackground }]}
          >
            <Text style={[localStyles.actionButtonText, { color: colors.textPrimary }]}>
              Refresh
            </Text>
          </Pressable>

          <Pressable
            onPress={onScrollToBottom}
            style={[
              localStyles.actionButton,
              localStyles.actionButtonMiddle,
              { backgroundColor: colors.cardBackground },
            ]}
          >
            <Text style={[localStyles.actionButtonText, { color: colors.textPrimary }]}>
              Earlier
            </Text>
          </Pressable>

          <Pressable
            onPress={onClear}
            style={[localStyles.actionButton, { backgroundColor: colors.dangerColor }]}
          >
            <Text style={[localStyles.actionButtonText, { color: "#FFFFFF" }]}>Clear</Text>
          </Pressable>
        </View>

        {/* Row 2: Export options */}
        <View style={localStyles.actionButtonRow}>
          <Pressable
            onPress={onCopyToClipboard}
            style={[
              localStyles.actionButton,
              localStyles.actionButtonHalf,
              { backgroundColor: colors.primaryColor },
            ]}
          >
            <Text style={[localStyles.actionButtonText, { color: "#FFFFFF" }]}>Copy</Text>
          </Pressable>

          <Pressable
            onPress={onShareFile}
            style={[localStyles.actionButton, { backgroundColor: colors.primaryColor }]}
          >
            <Text style={[localStyles.actionButtonText, { color: "#FFFFFF" }]}>
              Share File
            </Text>
          </Pressable>
        </View>
      </>
    );
  }
);

ActionButtons.displayName = "ActionButtons";

// ============================================================================
// Main Screen Component
// ============================================================================

export default function LogsScreen() {
  const { styles, colors, isDark } = useThemedStyles();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>("all");
  const [visibleTags, setVisibleTags] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Compute theme colors
  const themeColors: ThemeColors = useMemo(
    () => ({
      textPrimary: colors.textPrimary,
      background: colors.background,
      textSecondary: isDark ? "#999999" : "#666666",
      primaryColor: isDark ? "#4A9EFF" : "#007AFF",
      inputBackground: isDark ? "#1C1C1E" : "#F2F2F7",
      cardBackground: isDark ? "#2C2C2E" : "#E5E5EA",
      dangerColor: isDark ? "#FF453A" : "#FF3B30",
      borderColor: isDark ? "#2C2C2E" : "#E5E5EA",
    }),
    [colors.textPrimary, colors.background, isDark]
  );

  // Load available tags and initialize all as visible
  const loadTags = useCallback(() => {
    try {
      const tags = getAllTags();
      setAvailableTags(tags);
      // Initialize all tags as visible
      if (visibleTags.size === 0) {
        setVisibleTags(new Set(tags));
      }
    } catch (error) {
      log.error("Failed to load tags", error as Error);
    }
  }, [visibleTags.size]);

  // Load logs
  const loadLogs = useCallback(() => {
    setIsLoading(true);
    try {
      let loadedLogs: LogRow[];

      if (selectedLevel === "all") {
        loadedLogs = getAllLogs();
      } else {
        loadedLogs = getLogsByLevel(selectedLevel);
      }

      setLogs(loadedLogs);
    } catch (error) {
      log.error("Failed to load logs", error as Error);
      Alert.alert("Error", "Failed to load logs");
    } finally {
      setIsLoading(false);
    }
  }, [selectedLevel]);

  // Filter logs based on search text and visible tags
  const filteredLogs = useMemo(() => {
    let filtered = logs;

    // Filter by visible tags
    if (visibleTags.size > 0 && visibleTags.size < availableTags.length) {
      filtered = filtered.filter((logEntry) => visibleTags.has(logEntry.tag));
    }

    // Filter by search text
    if (searchText.trim()) {
      const lowercaseSearch = searchText.toLowerCase();
      filtered = filtered.filter(
        (logEntry) =>
          logEntry.message.toLowerCase().includes(lowercaseSearch) ||
          logEntry.tag.toLowerCase().includes(lowercaseSearch)
      );
    }

    return filtered;
  }, [logs, visibleTags, availableTags.length, searchText]);

  // Load tags and logs on mount
  useEffect(() => {
    loadTags();
    loadLogs();
  }, [loadLogs, loadTags]);

  // Acknowledge errors when logs screen is viewed
  useEffect(() => {
    const loggerSlice = useAppStore.getState().logger;
    // Acknowledge errors if there are any and they haven't been acknowledged yet
    if (loggerSlice.errorCount > 0 && loggerSlice.errorsAcknowledgedTimestamp === null) {
      loggerSlice.acknowledgeErrors();
    }
  }, []);

  // Handlers
  const handleClearLogs = useCallback(() => {
    Alert.alert("Clear All Logs", "Are you sure you want to clear all logs?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          try {
            logger.clearLogs();
            setLogs([]);
            // Reset error acknowledgment when logs are cleared
            useAppStore.getState().logger.resetErrorAcknowledgment();
            // Update counts after clearing
            useAppStore.getState().logger.updateErrorCounts();
            Alert.alert("Success", "All logs cleared");
          } catch (error) {
            log.error("Failed to clear logs", error as Error);
            Alert.alert("Error", "Failed to clear logs");
          }
        },
      },
    ]);
  }, []);

  const handleExportToClipboard = useCallback(() => {
    try {
      const exportText = filteredLogs
        .map((logEntry) => {
          const timestamp =
            logEntry.timestamp instanceof Date
              ? logEntry.timestamp.toISOString()
              : new Date(logEntry.timestamp).toISOString();
          return `[${timestamp}] [${logEntry.level.toUpperCase()}] [${
            logEntry.tag
          }] ${logEntry.message}`;
        })
        .join("\n");

      Clipboard.setStringAsync(exportText);
      Alert.alert("Success", "Logs copied to clipboard");
    } catch (error) {
      log.error("Failed to export logs to clipboard", error as Error);
      Alert.alert("Error", "Failed to export logs to clipboard");
    }
  }, [filteredLogs]);

  const handleExportToFile = useCallback(async () => {
    try {
      const exportText = filteredLogs
        .map((logEntry) => {
          const timestamp =
            logEntry.timestamp instanceof Date
              ? logEntry.timestamp.toISOString()
              : new Date(logEntry.timestamp).toISOString();
          return `[${timestamp}] [${logEntry.level.toUpperCase()}] [${
            logEntry.tag
          }] ${logEntry.message}`;
        })
        .join("\n");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `abs-logs-${timestamp}.txt`;
      const file = new File(Paths.cache, filename);

      await file.write(exportText);

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/plain",
          dialogTitle: "Export Logs",
        });
      } else {
        Alert.alert("Error", "Sharing is not available on this device");
      }
    } catch (error) {
      log.error("Failed to export logs to file", error as Error);
      Alert.alert("Error", "Failed to export logs to file");
    }
  }, [filteredLogs]);

  const scrollToBottom = useCallback(() => {
    if (filteredLogs.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [filteredLogs.length]);

  const toggleTag = useCallback((tag: string) => {
    setVisibleTags((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) {
        newSet.delete(tag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  }, []);

  const renderLogItem = useCallback(
    ({ item }: { item: LogRow }) => (
      <LogItem item={item} colors={themeColors} isDark={isDark} />
    ),
    [themeColors, isDark]
  );

  const hiddenTagCount = availableTags.length - visibleTags.size;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Logs",
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/more/logger-settings")}
              style={localStyles.headerButton}
            >
              <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
            </Pressable>
          ),
        }}
      />

      <View style={[localStyles.container, { backgroundColor: colors.background }]}>
        {/* Search and filter controls */}
        <View
          style={[
            localStyles.controlsContainer,
            { borderBottomColor: themeColors.borderColor },
          ]}
        >
          {/* Search input */}
          <TextInput
            style={[
              localStyles.searchInput,
              {
                backgroundColor: themeColors.inputBackground,
                color: colors.textPrimary,
              },
            ]}
            placeholder="Search logs..."
            placeholderTextColor={themeColors.textSecondary}
            value={searchText}
            onChangeText={setSearchText}
          />

          {/* Level filter buttons */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={localStyles.levelFiltersContainer}
          >
            <FilterButton
              level="all"
              label="All"
              isSelected={selectedLevel === "all"}
              onPress={() => setSelectedLevel("all")}
              colors={themeColors}
            />
            <FilterButton
              level="debug"
              label="Debug"
              isSelected={selectedLevel === "debug"}
              onPress={() => setSelectedLevel("debug")}
              colors={themeColors}
            />
            <FilterButton
              level="info"
              label="Info"
              isSelected={selectedLevel === "info"}
              onPress={() => setSelectedLevel("info")}
              colors={themeColors}
            />
            <FilterButton
              level="warn"
              label="Warn"
              isSelected={selectedLevel === "warn"}
              onPress={() => setSelectedLevel("warn")}
              colors={themeColors}
            />
            <FilterButton
              level="error"
              label="Error"
              isSelected={selectedLevel === "error"}
              onPress={() => setSelectedLevel("error")}
              colors={themeColors}
            />
          </ScrollView>

          {/* Tag filter toggle */}
          <Pressable
            onPress={() => setShowTagFilter(!showTagFilter)}
            style={localStyles.tagFilterToggle}
          >
            <Text style={[localStyles.tagFilterTitle, { color: colors.textPrimary }]}>
              Filter by Tag
              {hiddenTagCount > 0 && ` (${hiddenTagCount} hidden)`}
            </Text>
            <Text style={[localStyles.tagFilterArrow, { color: themeColors.primaryColor }]}>
              {showTagFilter ? "▼" : "▶"}
            </Text>
          </Pressable>

          {/* Tag filter list */}
          {showTagFilter && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={localStyles.tagFiltersContainer}
            >
              <View style={localStyles.tagFiltersContent}>
                {availableTags.map((tag) => (
                  <TagButton
                    key={tag}
                    tag={tag}
                    isVisible={visibleTags.has(tag)}
                    onPress={() => toggleTag(tag)}
                    colors={themeColors}
                  />
                ))}
              </View>
            </ScrollView>
          )}

          {/* Action buttons */}
          <ActionButtons
            onRefresh={loadLogs}
            onScrollToBottom={scrollToBottom}
            onClear={handleClearLogs}
            onCopyToClipboard={handleExportToClipboard}
            onShareFile={handleExportToFile}
            colors={themeColors}
          />
        </View>

        {/* Logs count */}
        <View style={[localStyles.logsCount, { backgroundColor: themeColors.inputBackground }]}>
          <Text style={[localStyles.logsCountText, { color: themeColors.textSecondary }]}>
            {filteredLogs.length} {filteredLogs.length === 1 ? "log" : "logs"}
            {searchText.trim() && ` (filtered from ${logs.length})`}
            {hiddenTagCount > 0 && ` · ${hiddenTagCount} tags hidden`}
          </Text>
        </View>

        {/* Logs list */}
        <FlatList
          ref={flatListRef}
          data={filteredLogs}
          renderItem={renderLogItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={localStyles.listContent}
          refreshing={isLoading}
          onRefresh={loadLogs}
          ListEmptyComponent={
            <View style={localStyles.emptyContainer}>
              <Text style={[localStyles.emptyText, { color: themeColors.textSecondary }]}>
                No logs found
              </Text>
            </View>
          }
        />
      </View>
    </>
  );
}

// ============================================================================
// Local Styles
// ============================================================================

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    marginRight: 16,
  },
  controlsContainer: {
    padding: 12,
    borderBottomWidth: 1,
  },
  searchInput: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  levelFiltersContainer: {
    marginBottom: 12,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  filterButtonText: {
    fontSize: 13,
  },
  tagFilterToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 8,
  },
  tagFilterTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  tagFilterArrow: {
    fontSize: 14,
  },
  tagFiltersContainer: {
    marginBottom: 12,
    maxHeight: 100,
  },
  tagFiltersContent: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tagButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  tagButtonText: {
    fontSize: 12,
  },
  actionButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
  },
  actionButtonMiddle: {
    marginHorizontal: 6,
  },
  actionButtonHalf: {
    marginRight: 6,
  },
  actionButtonText: {
    textAlign: "center",
    fontWeight: "600",
  },
  logsCount: {
    padding: 8,
  },
  logsCountText: {
    fontSize: 12,
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
  },
  logItem: {
    padding: 12,
    borderBottomWidth: 1,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  logTag: {
    fontSize: 12,
    fontWeight: "600",
    marginRight: 8,
  },
  logLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  logLevelText: {
    fontSize: 10,
    fontWeight: "600",
  },
  logTimestamp: {
    fontSize: 11,
    fontFamily: "monospace",
    textAlign: "right",
    flex: 1,
  },
  logMessage: {
    fontSize: 13,
    fontFamily: "monospace",
  },
});
