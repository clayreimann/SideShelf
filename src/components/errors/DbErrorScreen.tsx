/**
 * DbErrorScreen Component
 *
 * Blocking error screen shown when the database encounters an unrecoverable error
 * (e.g. failed migration, corrupt database). Children are never rendered when this
 * screen is active — it replaces the entire app UI.
 *
 * Features:
 * - Context-aware recovery: disk-full errors hide the reset button (resetting won't help)
 * - "Copy Error Details" button uses Share.share so users can send full stack traces
 * - Logs the error on mount via the separate logs.sqlite (safe when abs2.sqlite is broken)
 */

import { logger } from "@/lib/logger";
import React, { useEffect } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

interface Props {
  /** The error that caused the database to fail */
  error: Error;
  /** Called when the user taps "Reset Database". Not shown for disk-full errors. */
  onReset?: () => void;
}

/**
 * Returns true if the error is caused by a full device storage.
 * In that case, resetting the database won't help — free space is needed instead.
 */
function isDiskFullError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes("no space") || msg.includes("disk full") || msg.includes("enospc");
}

export function DbErrorScreen({ error, onReset }: Props) {
  useEffect(() => {
    logger.error("DbProvider", "DB error screen shown", error);
  }, [error]);

  const diskFull = isDiskFullError(error);

  const errorDetails = `${error.message}\n\n${error.stack ?? ""}`.trim();

  const handleCopyError = async () => {
    try {
      await Share.share({ message: errorDetails });
    } catch {
      // Share sheet dismissed — nothing to do
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Database Error</Text>
      <Text style={styles.body}>
        Something went wrong with the database. The app cannot continue.
      </Text>

      {diskFull ? (
        <Text style={styles.categoryMessage}>
          Your device storage is full. Free up space and restart the app.
        </Text>
      ) : (
        <>
          <Text style={styles.warning}>
            Warning: resetting the database will delete all locally cached data. Data on your
            Audiobookshelf server is not affected.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.resetButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Reset Database"
          >
            <Text style={styles.resetButtonText}>Reset Database</Text>
          </Pressable>
        </>
      )}

      <Pressable
        style={({ pressed }) => [styles.button, styles.copyButton, pressed && styles.buttonPressed]}
        onPress={handleCopyError}
        accessibilityRole="button"
        accessibilityLabel="Copy Error Details"
      >
        <Text style={styles.copyButtonText}>Copy Error Details</Text>
      </Pressable>

      <ScrollView style={styles.errorDetailsContainer}>
        <Text style={styles.errorDetailsText}>{errorDetails}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    color: "#cccccc",
    marginBottom: 20,
    lineHeight: 22,
  },
  categoryMessage: {
    fontSize: 15,
    color: "#f0a050",
    marginBottom: 20,
    lineHeight: 22,
  },
  warning: {
    fontSize: 13,
    color: "#aaaaaa",
    marginBottom: 12,
    lineHeight: 18,
    fontStyle: "italic",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  resetButton: {
    backgroundColor: "#b91c1c",
  },
  resetButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  copyButton: {
    backgroundColor: "#374151",
    borderWidth: 1,
    borderColor: "#6b7280",
  },
  copyButtonText: {
    color: "#d1d5db",
    fontSize: 15,
    fontWeight: "500",
  },
  errorDetailsContainer: {
    marginTop: 20,
    backgroundColor: "#111111",
    borderRadius: 8,
    padding: 12,
    maxHeight: 260,
  },
  errorDetailsText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#9ca3af",
    lineHeight: 16,
  },
});
