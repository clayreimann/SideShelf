/**
 * Settings Screen
 *
 * User preferences and app settings
 */

import Toggle from "@/components/ui/Toggle";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { useLibrary, useSettings } from "@/stores";
import { MenuView } from "@react-native-menu/menu";
import { Stack } from "expo-router";
import { useCallback } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90];

export default function SettingsScreen() {
  const { colors, isDark } = useThemedStyles();
  const {
    jumpForwardInterval,
    jumpBackwardInterval,
    smartRewindEnabled,
    autoQueueNextItemEnabled,
    diagnosticsEnabled,
    isLoading,
    updateJumpForwardInterval,
    updateJumpBackwardInterval,
    updateSmartRewindEnabled,
    updateAutoQueueNextItemEnabled,
    updateDiagnosticsEnabled,
  } = useSettings();
  const { libraries, selectedLibrary, selectLibrary } = useLibrary();

  // Helper colors
  const textSecondary = isDark ? "#999999" : "#666666";
  const primaryColor = isDark ? "#4A9EFF" : "#007AFF";

  // Update jump forward interval
  const handleJumpForwardChange = useCallback(
    async (seconds: number) => {
      try {
        await updateJumpForwardInterval(seconds);
      } catch (error) {
        console.error("Failed to update jump forward interval", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      }
    },
    [updateJumpForwardInterval]
  );

  // Update jump backward interval
  const handleJumpBackwardChange = useCallback(
    async (seconds: number) => {
      try {
        await updateJumpBackwardInterval(seconds);
      } catch (error) {
        console.error("Failed to update jump backward interval", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      }
    },
    [updateJumpBackwardInterval]
  );

  // Toggle smart rewind
  const toggleSmartRewind = useCallback(
    async (value: boolean) => {
      try {
        await updateSmartRewindEnabled(value);
      } catch (error) {
        console.error("Failed to update smart rewind setting", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      }
    },
    [updateSmartRewindEnabled]
  );

  // Toggle auto-queue next item
  const toggleAutoQueueNextItem = useCallback(
    async (value: boolean) => {
      try {
        await updateAutoQueueNextItemEnabled(value);
      } catch (error) {
        console.error("Failed to update auto-queue next item setting", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      }
    },
    [updateAutoQueueNextItemEnabled]
  );

  // Toggle diagnostics
  const toggleDiagnostics = useCallback(
    async (value: boolean) => {
      try {
        await updateDiagnosticsEnabled(value);
      } catch (error) {
        console.error("Failed to update diagnostics setting", error);
        Alert.alert(translate("common.error"), translate("settings.error.saveFailed"));
      }
    },
    [updateDiagnosticsEnabled]
  );

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: translate("settings.title") }} />
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: textSecondary }}>{translate("settings.loading")}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: translate("settings.title") }} />

      <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Library Selection Section */}
        {libraries.length > 0 && (
          <View style={{ padding: 16 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: textSecondary,
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              {translate("settings.sections.librarySelection")}
            </Text>
            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  fontSize: 15,
                  color: colors.textPrimary,
                  fontWeight: "500",
                  marginBottom: 8,
                }}
              >
                {translate("settings.currentLibrary")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {libraries.map((library) => (
                  <Pressable
                    key={library.id}
                    onPress={() => selectLibrary(library.id)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor:
                        selectedLibrary?.id === library.id
                          ? primaryColor
                          : isDark
                            ? "#3A3A3C"
                            : "#C7C7CC",
                      backgroundColor:
                        selectedLibrary?.id === library.id
                          ? primaryColor
                          : isDark
                            ? "#1C1C1E"
                            : "#FFFFFF",
                    }}
                  >
                    <Text
                      style={{
                        color: selectedLibrary?.id === library.id ? "#FFFFFF" : colors.textPrimary,
                        fontWeight: "600",
                      }}
                    >
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
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textSecondary,
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            {translate("settings.sections.playbackControls")}
          </Text>

          {/* Jump Forward Interval */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                color: colors.textPrimary,
                fontWeight: "500",
                marginBottom: 8,
              }}
            >
              {translate("settings.jumpForwardInterval")}
            </Text>
            <MenuView
              onPressAction={({ nativeEvent }) => {
                handleJumpForwardChange(parseInt(nativeEvent.event as string, 10));
              }}
              actions={INTERVAL_OPTIONS.map((seconds) => ({
                id: seconds.toString(),
                title: `${seconds}s`,
                state: jumpForwardInterval === seconds ? "on" : "off",
              }))}
            >
              <Pressable>
                <Text style={{ color: colors.link, fontSize: 15, textDecorationLine: "underline" }}>
                  {jumpForwardInterval}s
                </Text>
              </Pressable>
            </MenuView>
          </View>

          {/* Jump Backward Interval */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                color: colors.textPrimary,
                fontWeight: "500",
                marginBottom: 8,
              }}
            >
              {translate("settings.jumpBackwardInterval")}
            </Text>
            <MenuView
              onPressAction={({ nativeEvent }) => {
                handleJumpBackwardChange(parseInt(nativeEvent.event as string, 10));
              }}
              actions={INTERVAL_OPTIONS.map((seconds) => ({
                id: seconds.toString(),
                title: `${seconds}s`,
                state: jumpBackwardInterval === seconds ? "on" : "off",
              }))}
            >
              <Pressable>
                <Text style={{ color: colors.link, fontSize: 15, textDecorationLine: "underline" }}>
                  {jumpBackwardInterval}s
                </Text>
              </Pressable>
            </MenuView>
          </View>

          {/* Smart Rewind Toggle */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 14,
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                style={{
                  fontSize: 15,
                  color: colors.textPrimary,
                  fontWeight: "500",
                  marginBottom: 4,
                }}
              >
                {translate("settings.smartRewind")}
              </Text>
              <Text style={{ fontSize: 13, color: textSecondary, lineHeight: 18 }}>
                {translate("settings.smartRewindDescription")}
              </Text>
            </View>
            <Toggle value={smartRewindEnabled} onValueChange={toggleSmartRewind} />
          </View>

          {/* Auto-Queue Next Item Toggle */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 14,
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 10,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                style={{
                  fontSize: 15,
                  color: colors.textPrimary,
                  fontWeight: "500",
                  marginBottom: 4,
                }}
              >
                {translate("settings.autoQueueNextItem")}
              </Text>
              <Text style={{ fontSize: 13, color: textSecondary, lineHeight: 18 }}>
                {translate("settings.autoQueueNextItemDescription")}
              </Text>
            </View>
            <Toggle value={autoQueueNextItemEnabled} onValueChange={toggleAutoQueueNextItem} />
          </View>
        </View>

        {/* Developer Section */}
        <View style={{ padding: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: textSecondary,
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            {translate("settings.sections.developer")}
          </Text>

          {/* Diagnostics Toggle */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 14,
              backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              borderRadius: 10,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                style={{
                  fontSize: 15,
                  color: colors.textPrimary,
                  fontWeight: "500",
                  marginBottom: 4,
                }}
              >
                {translate("settings.diagnostics")}
              </Text>
              <Text style={{ fontSize: 13, color: textSecondary, lineHeight: 18 }}>
                {translate("settings.diagnosticsDescription")}
              </Text>
            </View>
            <Toggle value={diagnosticsEnabled} onValueChange={toggleDiagnostics} />
          </View>
        </View>
      </ScrollView>
    </>
  );
}
