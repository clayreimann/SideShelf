/**
 * Export utilities for copying to clipboard and sharing files
 *
 * Provides reusable functions for exporting data as text or JSON,
 * either to the clipboard or as shareable files.
 */

import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

export interface ExportOptions {
  /**
   * Optional callback for success (overrides default alert)
   */
  onSuccess?: (message: string) => void;
  /**
   * Optional callback for error (overrides default alert)
   */
  onError?: (error: Error) => void;
  /**
   * Optional custom filename (without extension)
   */
  filename?: string;
  /**
   * Optional dialog title for sharing
   */
  dialogTitle?: string;
}

/**
 * Copy text content to the clipboard
 *
 * @param content - The text content to copy
 * @param options - Optional callbacks and configuration
 */
export async function copyToClipboard(content: string, options: ExportOptions = {}): Promise<void> {
  try {
    await Clipboard.setStringAsync(content);

    if (options.onSuccess) {
      options.onSuccess("Content copied to clipboard");
    } else {
      Alert.alert("Success", "Content copied to clipboard");
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (options.onError) {
      options.onError(err);
    } else {
      Alert.alert("Error", "Failed to copy to clipboard");
    }
  }
}

/**
 * Export content as a text file and share it
 *
 * @param content - The text content to export
 * @param options - Optional callbacks and configuration
 */
export async function exportAsTextFile(
  content: string,
  options: ExportOptions = {}
): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = options.filename
      ? `${options.filename}-${timestamp}.txt`
      : `export-${timestamp}.txt`;
    const file = new File(Paths.cache, filename);

    await file.write(content);

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/plain",
        dialogTitle: options.dialogTitle || "Share Export",
      });

      if (options.onSuccess) {
        options.onSuccess("File shared successfully");
      }
    } else {
      throw new Error("Sharing is not available on this device");
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (options.onError) {
      options.onError(err);
    } else {
      Alert.alert("Error", "Failed to export file");
    }
  }
}

/**
 * Copy JSON data to the clipboard (formatted with indentation)
 *
 * @param data - The data to serialize and copy
 * @param options - Optional callbacks and configuration
 */
export async function copyJsonToClipboard(
  data: unknown,
  options: ExportOptions = {}
): Promise<void> {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    await copyToClipboard(jsonString, options);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (options.onError) {
      options.onError(err);
    } else {
      Alert.alert("Error", "Failed to serialize and copy JSON");
    }
  }
}

/**
 * Export JSON data as a file and share it
 *
 * @param data - The data to serialize and export
 * @param options - Optional callbacks and configuration
 */
export async function exportJsonAsFile(data: unknown, options: ExportOptions = {}): Promise<void> {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = options.filename
      ? `${options.filename}-${timestamp}.json`
      : `export-${timestamp}.json`;
    const file = new File(Paths.cache, filename);

    await file.write(jsonString);

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: options.dialogTitle || "Share Export",
      });

      if (options.onSuccess) {
        options.onSuccess("JSON file shared successfully");
      }
    } else {
      throw new Error("Sharing is not available on this device");
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (options.onError) {
      options.onError(err);
    } else {
      Alert.alert("Error", "Failed to export JSON file");
    }
  }
}
