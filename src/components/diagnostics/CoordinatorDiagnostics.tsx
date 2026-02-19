/**
 * Coordinator Diagnostics Component
 *
 * Display coordinator state, metrics, and event history for debugging.
 * Phase 1: Monitor observer mode operation.
 */

import { copyJsonToClipboard, exportJsonAsFile } from "@/lib/exportUtils";
import { formatTime } from "@/lib/helpers/formatters";
import { useThemedStyles } from "@/lib/theme";
import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";
import type {
  CoordinatorMetrics,
  DiagnosticEvent,
  PlayerEvent,
  StateContext,
  TransitionHistoryEntry,
} from "@/types/coordinator";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Format timestamp with milliseconds
 */
function formatTimestampWithMs(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Collapsed event group for display
 */
interface CollapsedEventGroup {
  entry: TransitionHistoryEntry;
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
}

/**
 * Collapse consecutive repeated events in the transition history
 */
function collapseEvents(history: TransitionHistoryEntry[]): CollapsedEventGroup[] {
  if (history.length === 0) return [];

  const collapsed: CollapsedEventGroup[] = [];
  let currentGroup: CollapsedEventGroup = {
    entry: history[0],
    count: 1,
    firstTimestamp: history[0].timestamp,
    lastTimestamp: history[0].timestamp,
  };

  for (let i = 1; i < history.length; i++) {
    const entry = history[i];
    const prev = currentGroup.entry;

    // Check if this entry is the same type as the current group
    if (
      entry.event.type === prev.event.type &&
      entry.fromState === prev.fromState &&
      entry.toState === prev.toState &&
      entry.allowed === prev.allowed
    ) {
      currentGroup.count++;
      currentGroup.lastTimestamp = entry.timestamp;
    } else {
      collapsed.push(currentGroup);
      currentGroup = {
        entry: entry,
        count: 1,
        firstTimestamp: entry.timestamp,
        lastTimestamp: entry.timestamp,
      };
    }
  }

  collapsed.push(currentGroup);
  return collapsed;
}

export function CoordinatorDiagnostics({ autoRefresh = true }: { autoRefresh?: boolean }) {
  const { colors, isDark } = useThemedStyles();
  const [metrics, setMetrics] = useState<CoordinatorMetrics | null>(null);
  const [context, setContext] = useState<StateContext | null>(null);
  const [eventQueue, setEventQueue] = useState<PlayerEvent[]>([]);
  const [transitionHistory, setTransitionHistory] = useState<TransitionHistoryEntry[]>([]);
  const [lastDiagnostic, setLastDiagnostic] = useState<DiagnosticEvent | null>(null);

  const refreshData = () => {
    const coordinator = getCoordinator();
    setMetrics(coordinator.getMetrics());
    setContext(coordinator.getContext());
    setEventQueue(Array.from(coordinator.getEventQueue()));
    setTransitionHistory(Array.from(coordinator.getTransitionHistory()).reverse()); // Most recent first
  };

  // Collapse consecutive repeated events for display
  const collapsedHistory = useMemo(() => {
    return collapseEvents(transitionHistory.slice(0, 20));
  }, [transitionHistory]);

  useEffect(() => {
    const coordinator = getCoordinator();

    // Listen for diagnostic events
    const handleDiagnostic = (event: DiagnosticEvent) => {
      setLastDiagnostic(event);
    };

    coordinator.on("diagnostic", handleDiagnostic);

    // Initial load
    refreshData();

    // Auto-refresh if enabled
    let interval: number | null = null;
    if (autoRefresh) {
      interval = setInterval(refreshData, 1000);
    }

    return () => {
      coordinator.off("diagnostic", handleDiagnostic);
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [autoRefresh]);

  const copyDiagnostics = () => {
    const coordinator = getCoordinator();
    const data = coordinator.exportDiagnostics();
    copyJsonToClipboard(data, {
      onSuccess: () => {
        Alert.alert("Success", "Diagnostics copied to clipboard");
      },
      onError: (error) => {
        console.error("[CoordinatorDiagnostics] Failed to copy:", error);
        Alert.alert("Error", "Failed to copy diagnostics");
      },
    });
  };

  const exportDiagnostics = () => {
    const coordinator = getCoordinator();
    const data = coordinator.exportDiagnostics();
    exportJsonAsFile(data, {
      filename: "coordinator-diagnostics",
      dialogTitle: "Share Coordinator Diagnostics",
      onError: (error) => {
        console.error("[CoordinatorDiagnostics] Failed to export:", error);
        if (error.message.includes("not available")) {
          Alert.alert("Error", "Sharing is not available on this device");
        } else {
          Alert.alert("Error", "Failed to export diagnostics");
        }
      },
    });
  };

  const clearHistory = () => {
    Alert.alert(
      "Clear Transition History",
      "This will clear all transition history entries. Current state and metrics will be preserved. Continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            const coordinator = getCoordinator();
            coordinator.clearTransitionHistory();
            refreshData();
            Alert.alert("Success", "Transition history cleared");
          },
        },
      ]
    );
  };

  const styles = createStyles(colors, isDark);

  return (
    <ScrollView style={styles.container}>
      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.button} onPress={copyDiagnostics}>
          <Text style={styles.buttonText}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={exportDiagnostics}>
          <Text style={styles.buttonText}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={clearHistory}>
          <Text style={styles.buttonText}>Clear History</Text>
        </TouchableOpacity>
      </View>

      {/* Metrics */}
      {metrics && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Metrics</Text>
          <View style={styles.card}>
            <MetricRow
              label="Total Events Processed"
              value={metrics.totalEventsProcessed}
              labelFlex={1}
              valueFlex={1}
              styles={styles}
            />
            <MetricRow
              label="State Transitions"
              value={metrics.stateTransitionCount}
              labelFlex={1}
              valueFlex={1}
              styles={styles}
            />
            <MetricRow
              label="Rejected Transitions"
              value={metrics.rejectedTransitionCount}
              highlight={metrics.rejectedTransitionCount > 0}
              labelFlex={1}
              valueFlex={1}
              styles={styles}
            />
            <MetricRow
              label="Event Queue Length"
              value={metrics.eventQueueLength}
              labelFlex={1}
              valueFlex={1}
              styles={styles}
            />
            <MetricRow
              label="Avg Processing Time"
              value={`${metrics.avgEventProcessingTime.toFixed(2)}ms`}
              labelFlex={1}
              valueFlex={1}
              styles={styles}
            />
            <MetricRow
              label="Last Event"
              value={
                metrics.lastEventTimestamp
                  ? formatTimestampWithMs(metrics.lastEventTimestamp)
                  : "Never"
              }
              styles={styles}
            />
          </View>
        </View>
      )}

      {/* Current State */}
      {context && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current State</Text>
          <View style={styles.card}>
            <MetricRow label="State" value={context.currentState} highlight styles={styles} />
            <MetricRow
              label="Previous State"
              value={context.previousState || "None"}
              styles={styles}
            />
            <MetricRow
              label="Track"
              value={context.currentTrack?.title || "None"}
              styles={styles}
            />
            <MetricRow label="Position" value={formatTime(context.position)} styles={styles} />
            <MetricRow label="Duration" value={formatTime(context.duration)} styles={styles} />
            <MetricRow
              label="Is Playing"
              value={context.isPlaying ? "Yes" : "No"}
              styles={styles}
            />
            <MetricRow label="Playback Rate" value={`${context.playbackRate}x`} styles={styles} />
            <MetricRow
              label="Volume"
              value={`${(context.volume * 100).toFixed(0)}%`}
              styles={styles}
            />
            <MetricRow label="Session ID" value={context.sessionId || "None"} styles={styles} />
          </View>
        </View>
      )}

      {/* Last Diagnostic Event */}
      {lastDiagnostic && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last Diagnostic Event</Text>
          <View style={styles.card}>
            <MetricRow label="Event" value={lastDiagnostic.event.type} styles={styles} />
            <MetricRow label="Current State" value={lastDiagnostic.currentState} styles={styles} />
            <MetricRow
              label="Next State"
              value={lastDiagnostic.nextState || "No change"}
              styles={styles}
            />
            <MetricRow
              label="Allowed"
              value={lastDiagnostic.allowed ? "Yes" : "No"}
              highlight={!lastDiagnostic.allowed}
              styles={styles}
            />
            <MetricRow
              label="Time"
              value={formatTimestampWithMs(lastDiagnostic.timestamp)}
              styles={styles}
            />
          </View>
        </View>
      )}

      {/* Transition History */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Transition History ({transitionHistory.length} entries)
        </Text>
        <View style={styles.card}>
          {transitionHistory.length === 0 ? (
            <Text style={styles.emptyText}>No transitions recorded yet</Text>
          ) : (
            collapsedHistory.map((group, index) => {
              const entry = group.entry;
              const stateChanged = entry.toState && entry.toState !== entry.fromState;
              return (
                <View
                  key={index}
                  style={[
                    styles.transitionEntry,
                    !entry.allowed && styles.transitionRejected,
                    entry.allowed && stateChanged && styles.transitionAccepted,
                  ]}
                >
                  <View style={styles.transitionHeader}>
                    <Text
                      style={[
                        styles.transitionEvent,
                        !entry.allowed && styles.transitionEventRejected,
                      ]}
                    >
                      {entry.event.type}
                      {group.count > 1 && ` (×${group.count})`}
                    </Text>
                    <Text style={styles.transitionTime}>
                      {group.count > 1
                        ? `${formatTimestampWithMs(group.firstTimestamp)} - ${formatTimestampWithMs(group.lastTimestamp)}`
                        : formatTimestampWithMs(entry.timestamp)}
                    </Text>
                  </View>
                  <Text style={styles.transitionStates}>
                    {entry.fromState} → {entry.toState || entry.fromState}
                  </Text>
                  {!entry.allowed && entry.reason && (
                    <Text style={styles.transitionReason}>Rejected: {entry.reason}</Text>
                  )}
                  {entry.allowed && !stateChanged && (
                    <Text style={styles.transitionNoChange}>No state change</Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Event Queue */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Event Queue ({eventQueue.length} events)</Text>
        <View style={styles.card}>
          {eventQueue.length === 0 ? (
            <Text style={styles.emptyText}>Queue is empty (events are processed immediately)</Text>
          ) : (
            eventQueue.map((event, index) => (
              <Text key={index} style={styles.eventText}>
                {index + 1}. {event.type}
                {"payload" in event ? ` (${JSON.stringify(event.payload)})` : ""}
              </Text>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function MetricRow({
  label,
  value,
  labelFlex,
  valueFlex,
  highlight,
  styles,
}: {
  label: string;
  value: string | number;
  labelFlex?: number;
  valueFlex?: number;
  highlight?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, labelFlex !== undefined && { flex: labelFlex }]}>
        {label}:
      </Text>
      <Text
        style={[
          styles.metricValue,
          highlight && styles.metricHighlight,
          valueFlex !== undefined && { flex: valueFlex },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemedStyles>["colors"], isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    controls: {
      flexDirection: "row",
      paddingVertical: 16,
      gap: 8,
    },
    button: {
      flex: 1,
      backgroundColor: isDark ? "#3a3a3a" : "#e0e0e0",
      padding: 12,
      borderRadius: 8,
      alignItems: "center",
    },
    buttonActive: {
      backgroundColor: "#4CAF50",
    },
    buttonDanger: {
      backgroundColor: isDark ? "#5a2a2a" : "#ffcccc",
    },
    buttonText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "600",
    },
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: colors.textPrimary,
      // paddingHorizontal: 16,
      marginBottom: 8,
    },
    card: {
      backgroundColor: isDark ? "#2a2a2a" : "#f5f5f5",
      // marginHorizontal: 16,
      padding: 16,
      borderRadius: 8,
    },
    metricRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    metricLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      flex: 1,
    },
    metricValue: {
      fontSize: 14,
      color: colors.textPrimary,
      fontWeight: "600",
      flex: 2,
      textAlign: "right",
    },
    metricHighlight: {
      color: "#4CAF50",
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: "center",
      paddingVertical: 12,
    },
    eventText: {
      color: isDark ? "#cccccc" : "#555555",
      fontSize: 12,
      fontFamily: "monospace",
      paddingVertical: 4,
    },
    transitionEntry: {
      borderLeftWidth: 3,
      borderLeftColor: colors.textSecondary,
      paddingLeft: 12,
      paddingVertical: 8,
      marginBottom: 8,
      backgroundColor: isDark ? "#252525" : "#e8e8e8",
      borderRadius: 4,
    },
    transitionAccepted: {
      borderLeftColor: "#4CAF50",
      backgroundColor: isDark ? "#1a2a1a" : "#e8f5e9",
    },
    transitionRejected: {
      borderLeftColor: "#f44336",
      backgroundColor: isDark ? "#2a1a1a" : "#ffebee",
    },
    transitionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    transitionEvent: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "600",
      fontFamily: "monospace",
      flex: 1,
    },
    transitionEventRejected: {
      color: "#ff6b6b",
    },
    transitionTime: {
      color: colors.textSecondary,
      fontSize: 11,
    },
    transitionStates: {
      color: isDark ? "#cccccc" : "#555555",
      fontSize: 12,
      fontFamily: "monospace",
      marginBottom: 2,
    },
    transitionReason: {
      color: "#ff6b6b",
      fontSize: 11,
      fontStyle: "italic",
      marginTop: 2,
    },
    transitionNoChange: {
      color: colors.textSecondary,
      fontSize: 11,
      fontStyle: "italic",
      marginTop: 2,
    },
    footer: {
      padding: 16,
      backgroundColor: isDark ? "#2a2a2a" : "#f5f5f5",
      marginTop: 16,
    },
    footerText: {
      color: colors.textSecondary,
      fontSize: 12,
      textAlign: "center",
      fontStyle: "italic",
    },
  });
}
