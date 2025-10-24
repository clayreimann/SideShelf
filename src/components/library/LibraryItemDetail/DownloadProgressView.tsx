/**
 * DownloadProgress - Component to display download progress with controls
 *
 * Features:
 * - Single progress bar when downloading only one file
 * - Dual progress bars (overall + current file) when downloading multiple files
 * - Download statistics (speed, ETA, file count, size)
 * - Control buttons (pause, resume, cancel)
 */

import { ProgressBar } from '@/components/ui';
import { formatBytes, formatSpeed, formatTimeRemaining } from '@/lib/helpers/formatters';
import { useThemedStyles } from '@/lib/theme';
import { DownloadProgress as DownloadProgressType } from '@/services/DownloadService';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface DownloadProgressProps {
  downloadProgress: DownloadProgressType | null;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

/**
 * Displays download progress with statistics and control buttons
 */
export default function DownloadProgressView({
  downloadProgress,
  onPause,
  onResume,
  onCancel,
}: DownloadProgressProps) {
  const { styles, isDark } = useThemedStyles();

  if (!downloadProgress) {
    return (
      <View
        style={{
          backgroundColor: isDark ? '#333' : '#f5f5f5',
          borderRadius: 8,
          padding: 12,
        }}
      >
        <Text
          style={[
            styles.text,
            { fontSize: 14, marginBottom: 8, textAlign: 'center' },
          ]}
        >
          Preparing download...
        </Text>
      </View>
    );
  }

  const isSingleFile = (downloadProgress.totalFiles || 0) === 1;
  const isDownloading = downloadProgress.status === 'downloading';
  const showFileProgress = isDownloading && !isSingleFile && downloadProgress.currentFile;

  // Determine status text
  let statusText = 'Preparing download...';
  if (downloadProgress) {
    switch (downloadProgress.status) {
      case 'downloading':
        statusText = isSingleFile
          ? `Downloading: ${downloadProgress.currentFile || ''}`
          : `Downloading file ${downloadProgress.downloadedFiles || 0} of ${downloadProgress.totalFiles || 0}`;
        break;
      case 'completed':
        statusText = 'Download Complete!';
        break;
      case 'cancelled':
        statusText = 'Download Cancelled';
        break;
      case 'error':
        statusText = 'Download Error';
        break;
      case 'paused':
        statusText = 'Download Paused';
        break;
    }
  }

  return (
    <View
      style={{
        backgroundColor: isDark ? '#333' : '#f5f5f5',
        borderRadius: 8,
        padding: 12,
      }}
    >
      <Text
        style={[
          styles.text,
          { fontSize: 14, marginBottom: 8, textAlign: 'center' },
        ]}
      >
        {statusText}
      </Text>

      {/* Main Progress Bar (Overall for multiple files, only bar for single file) */}
      <View style={{ marginBottom: 8 }}>
        <ProgressBar
          progress={downloadProgress.totalProgress || 0}
          variant="large"
          progressColor={
            downloadProgress.status === 'error' ? '#FF3B30' : '#007AFF'
          }
          customPercentageText={
            isSingleFile
              ? `${Math.round((downloadProgress.totalProgress || 0) * 100)}%`
              : `Overall Progress: ${Math.round((downloadProgress.totalProgress || 0) * 100)}%`
          }
          showPercentage={true}
        />
      </View>

      {/* Current File Progress Bar (only show for multiple files) */}
      {showFileProgress && (
        <View style={{ marginBottom: 8 }}>
          <ProgressBar
            progress={downloadProgress.fileProgress || 0}
            variant="medium"
            progressColor="#34C759"
            customPercentageText={`Current File: ${Math.round(
              (downloadProgress.fileProgress || 0) * 100
            )}%`}
            showPercentage={true}
          />
        </View>
      )}

      {/* Download Stats */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          {!isSingleFile && (
            <Text
              style={[
                styles.text,
                { fontSize: 11, opacity: 0.7, textAlign: 'left' },
              ]}
            >
              Files: {downloadProgress.downloadedFiles || 0}/
              {downloadProgress.totalFiles || 0}
            </Text>
          )}
          <Text
            style={[
              styles.text,
              { fontSize: 11, opacity: 0.7, textAlign: 'left' },
            ]}
          >
            Size: {formatBytes(downloadProgress.bytesDownloaded || 0)}/
            {formatBytes(downloadProgress.totalBytes || 0)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.text,
              { fontSize: 11, opacity: 0.7, textAlign: 'right' },
            ]}
          >
            Speed: {formatSpeed(downloadProgress.downloadSpeed || 0)}
          </Text>
          {(downloadProgress.downloadSpeed || 0) > 0 && (
            <Text
              style={[
                styles.text,
                { fontSize: 11, opacity: 0.7, textAlign: 'right' },
              ]}
            >
              ETA:{' '}
              {formatTimeRemaining(
                (downloadProgress.totalBytes || 0) -
                  (downloadProgress.bytesDownloaded || 0),
                downloadProgress.downloadSpeed || 0,
                3, // minSamplesForEta
                downloadProgress.speedSampleCount || 0
              )}
            </Text>
          )}
        </View>
      </View>

      {/* Download Control Buttons */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          marginTop: 8,
        }}
      >
        {downloadProgress.canPause && (
          <TouchableOpacity
            style={{
              backgroundColor: '#FF9500',
              borderRadius: 6,
              paddingVertical: 8,
              paddingHorizontal: 16,
            }}
            onPress={onPause}
          >
            <Text
              style={{
                color: 'white',
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              ⏸️ Pause
            </Text>
          </TouchableOpacity>
        )}

        {downloadProgress.canResume && (
          <TouchableOpacity
            style={{
              backgroundColor: '#34C759',
              borderRadius: 6,
              paddingVertical: 8,
              paddingHorizontal: 16,
            }}
            onPress={onResume}
          >
            <Text
              style={{
                color: 'white',
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              ▶️ Resume
            </Text>
          </TouchableOpacity>
        )}

        {(downloadProgress.status === 'downloading' ||
          downloadProgress.status === 'paused') && (
          <TouchableOpacity
            style={{
              backgroundColor: '#FF3B30',
              borderRadius: 6,
              paddingVertical: 8,
              paddingHorizontal: 16,
            }}
            onPress={onCancel}
          >
            <Text
              style={{
                color: 'white',
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              ❌ Cancel
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
