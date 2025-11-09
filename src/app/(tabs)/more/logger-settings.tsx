/**
 * Logger Settings Screen - Manage logger tag enable/disable and log levels
 *
 * This screen allows users to enable or disable specific logger tags
 * and configure log levels per tag to reduce noise during development and debugging.
 */

import Toggle from "@/components/ui/Toggle";
import { translate } from "@/i18n";
import { formatBytes } from "@/lib/helpers/formatters";
import { getAllTags, getDatabaseSize, logger, type LogLevel } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { MenuView } from "@react-native-menu/menu";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";

// Create cached sublogger for this screen
const log = logger.forTag("LoggerSettingsScreen");

const RETENTION_OPTIONS = [
  { label: translate("loggerSettings.retention.1hour"), hours: 1 },
  { label: translate("loggerSettings.retention.6hours"), hours: 6 },
  { label: translate("loggerSettings.retention.12hours"), hours: 12 },
  { label: translate("loggerSettings.retention.1day"), hours: 24 },
  { label: translate("loggerSettings.retention.3days"), hours: 72 },
  { label: translate("loggerSettings.retention.7days"), hours: 168 },
];

const LOG_LEVELS: Array<{ label: string; value: LogLevel | "default" }> = [
  { label: translate("loggerSettings.level.default"), value: "default" },
  { label: translate("loggerSettings.level.debug"), value: "debug" },
  { label: translate("loggerSettings.level.info"), value: "info" },
  { label: translate("loggerSettings.level.warn"), value: "warn" },
  { label: translate("loggerSettings.level.error"), value: "error" },
];

export default function LoggerSettingsScreen() {
  const { colors, isDark } = useThemedStyles();
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [disabledTags, setDisabledTags] = useState<string[]>([]);
  const [tagLevels, setTagLevels] = useState<Record<string, LogLevel | "default">>({});
  const [retentionHours, setRetentionHours] = useState<number>(() =>
    logger.getRetentionDurationHours()
  );
  const [isUpdatingRetention, setIsUpdatingRetention] = useState<boolean>(false);
  const [defaultLogLevel, setDefaultLogLevel] = useState<LogLevel>(() =>
    logger.getDefaultLogLevel()
  );
  const [isUpdatingDefaultLevel, setIsUpdatingDefaultLevel] = useState<boolean>(false);
  const [dbSize, setDbSize] = useState<number>(0);

  // Helper colors
  const textSecondary = isDark ? "#999999" : "#666666";
  const primaryColor = isDark ? "#4A9EFF" : "#007AFF";
  const cardBackground = isDark ? "#2C2C2E" : "#E5E5EA";

  // Load tags and retention preference
  const loadLoggerSettings = useCallback(() => {
    try {
      const disabled = logger.getDisabledTags();
      setDisabledTags(disabled);
      const tags = getAllTags();
      setAvailableTags([...tags, ...disabled.filter((t) => !tags.includes(t))].sort());
      setRetentionHours(logger.getRetentionDurationHours());
      setDefaultLogLevel(logger.getDefaultLogLevel());

      // Load tag levels
      const levels = logger.getAllTagLevels();
      const levelsWithDefaults: Record<string, LogLevel | "default"> = {};
      tags.forEach((tag) => {
        levelsWithDefaults[tag] = levels[tag] || "default";
      });
      setTagLevels(levelsWithDefaults);

      // Load database size
      const size = getDatabaseSize();
      setDbSize(size);
    } catch (error) {
      log.error("Failed to load logger settings", error as Error);
      Alert.alert(translate("common.error"), translate("loggerSettings.error.loadFailed"));
    }
  }, []);

  useEffect(() => {
    loadLoggerSettings();
  }, [loadLoggerSettings]);

  // Toggle tag enabled/disabled
  const toggleTagEnabled = useCallback(
    (tag: string) => {
      if (disabledTags.includes(tag)) {
        logger.enableTag(tag);
        setDisabledTags((prev) => prev.filter((t) => t !== tag));
      } else {
        logger.disableTag(tag);
        setDisabledTags((prev) => [...prev, tag]);
      }
    },
    [disabledTags]
  );

  // Handle log level change for a tag
  const handleLogLevelChange = useCallback(async (tag: string, level: LogLevel | "default") => {
    try {
      if (level === "default") {
        await logger.clearTagLevel(tag);
        setTagLevels((prev) => ({ ...prev, [tag]: "default" }));
      } else {
        await logger.setTagLevel(tag, level);
        setTagLevels((prev) => ({ ...prev, [tag]: level }));
      }
    } catch (error) {
      log.error(`Failed to set log level for tag "${tag}"`, error as Error);
      Alert.alert(
        translate("common.error"),
        translate("loggerSettings.error.setLogLevelFailed", { tag })
      );
    }
  }, []);

  // Enable all tags
  const handleEnableAll = useCallback(() => {
    logger.enableAllTags();
    setDisabledTags([]);
  }, []);

  // Disable all tags
  const handleDisableAll = useCallback(() => {
    availableTags.forEach((tag) => logger.disableTag(tag));
    setDisabledTags([...availableTags]);
  }, [availableTags]);

  const handleRetentionChange = useCallback(
    async (hours: number) => {
      if (hours === retentionHours || isUpdatingRetention) {
        return;
      }

      setIsUpdatingRetention(true);
      try {
        await logger.setRetentionDurationHours(hours);
        setRetentionHours(hours);
      } catch (error) {
        log.error("Failed to update retention", error as Error);
        Alert.alert(
          translate("common.error"),
          translate("loggerSettings.error.updateRetentionFailed")
        );
      } finally {
        setIsUpdatingRetention(false);
      }
    },
    [isUpdatingRetention, retentionHours]
  );

  const handleDefaultLogLevelChange = useCallback(
    async (level: LogLevel) => {
      if (level === defaultLogLevel || isUpdatingDefaultLevel) {
        return;
      }

      setIsUpdatingDefaultLevel(true);
      try {
        await logger.setDefaultLogLevel(level);
        setDefaultLogLevel(level);
      } catch (error) {
        log.error("Failed to update default log level", error as Error);
        Alert.alert(
          translate("common.error"),
          translate("loggerSettings.error.updateDefaultLevelFailed")
        );
      } finally {
        setIsUpdatingDefaultLevel(false);
      }
    },
    [isUpdatingDefaultLevel, defaultLogLevel]
  );

  // Render default log level row
  const renderDefaultLogLevelRow = () => {
    const levelLabel = LOG_LEVELS.find((l) => l.value === defaultLogLevel)?.label || "Info";
    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? "#2C2C2E" : "#E5E5EA",
        }}
      >
        <Text style={{ fontSize: 15, color: colors.textPrimary }}>
          {translate("loggerSettings.defaultLogLevel")}
        </Text>
        <MenuView
          onPressAction={({ nativeEvent }) => {
            const selectedLevel = nativeEvent.event as LogLevel;
            handleDefaultLogLevelChange(selectedLevel);
          }}
          actions={LOG_LEVELS.filter((level) => level.value !== "default").map((level) => ({
            id: level.value,
            title: level.label,
            state: defaultLogLevel === level.value ? "on" : "off",
          }))}
        >
          <Pressable>
            <Text style={{ fontSize: 15, color: colors.link, textDecorationLine: "underline" }}>
              {levelLabel}
            </Text>
          </Pressable>
        </MenuView>
      </View>
    );
  };

  // Render retention row
  const renderRetentionRow = () => {
    const currentRetention = RETENTION_OPTIONS.find((o) => o.hours === retentionHours);
    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? "#2C2C2E" : "#E5E5EA",
        }}
      >
        <Text style={{ fontSize: 15, color: colors.textPrimary }}>
          {translate("loggerSettings.logRetention")}
        </Text>
        <MenuView
          onPressAction={({ nativeEvent }) => {
            const selectedHours = parseInt(nativeEvent.event as string, 10);
            handleRetentionChange(selectedHours);
          }}
          actions={RETENTION_OPTIONS.map((option) => ({
            id: option.hours.toString(),
            title: option.label,
            state: retentionHours === option.hours ? "on" : "off",
          }))}
        >
          <Pressable>
            <Text style={{ fontSize: 15, color: colors.link, textDecorationLine: "underline" }}>
              {currentRetention?.label || translate("loggerSettings.notSet")}
            </Text>
          </Pressable>
        </MenuView>
      </View>
    );
  };

  // Render tag item
  const renderTagItem = ({ item: tag }: { item: string }) => {
    const isEnabled = !disabledTags.includes(tag);
    const currentLevel = tagLevels[tag] || "default";
    const levelLabel = LOG_LEVELS.find((l) => l.value === currentLevel)?.label || "Default";

    return (
      <View
        style={{
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? "#2C2C2E" : "#E5E5EA",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <Text style={{ fontSize: 15, color: colors.textPrimary, flex: 1 }}>{tag}</Text>

          <MenuView
            onPressAction={({ nativeEvent }) => {
              const selectedLevel = nativeEvent.event as LogLevel | "default";
              handleLogLevelChange(tag, selectedLevel);
            }}
            actions={LOG_LEVELS.map((level) => ({
              id: level.value,
              title: level.label,
              state: currentLevel === level.value ? "on" : "off",
            }))}
          >
            <Pressable style={{ marginRight: 16 }}>
              <Text style={{ fontSize: 15, color: colors.link, textDecorationLine: "underline" }}>
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
      <View style={{ padding: 12, backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" }}>
        <Text style={{ fontSize: 13, color: textSecondary, textAlign: "center" }}>
          {translate("loggerSettings.tagsEnabled", {
            enabled: availableTags.length - disabledTags.length,
            total: availableTags.length,
          })}
          {disabledTags.length > 0 &&
            ` · ${translate("loggerSettings.tagsDisabled", { count: disabledTags.length })}`}
          {dbSize > 0 && ` · ${translate("loggerSettings.dbSize", { size: formatBytes(dbSize) })}`}
        </Text>
      </View>

      {/* Enable/Disable All buttons */}
      {availableTags.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? "#2C2C2E" : "#E5E5EA",
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
                textAlign: "center",
                color: disabledTags.length === 0 ? textSecondary : "#FFFFFF",
                fontWeight: "600",
                fontSize: 14,
              }}
            >
              {translate("loggerSettings.enableAll")}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleDisableAll}
            disabled={disabledTags.length === availableTags.length}
            style={{
              flex: 1,
              backgroundColor:
                disabledTags.length === availableTags.length
                  ? cardBackground
                  : isDark
                    ? "#FF453A"
                    : "#FF3B30",
              borderRadius: 8,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: disabledTags.length === availableTags.length ? textSecondary : "#FFFFFF",
                fontWeight: "600",
                fontSize: 14,
              }}
            >
              {translate("loggerSettings.disableAll")}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: translate("loggerSettings.title") }} />

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
            <View style={{ padding: 40, alignItems: "center" }}>
              <Text style={{ fontSize: 16, color: textSecondary }}>
                {translate("loggerSettings.empty")}
              </Text>
            </View>
          }
        />
      </View>
    </>
  );
}
