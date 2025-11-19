import { CollapsibleSection } from "@/components/ui";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import { ApiAudioFile } from "@/types/api";
import React from "react";
import { Text, View } from "react-native";

// Helper function to format time in seconds to HH:MM:SS
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}

interface AudioFilesSectionProps {
  audioFiles: ApiAudioFile[];
}

export default function AudioFilesSection({ audioFiles }: AudioFilesSectionProps) {
  const { styles, isDark } = useThemedStyles();

  if (audioFiles.length === 0) {
    return null;
  }

  return (
    <CollapsibleSection title={translate("libraryItem.audioFiles", { count: audioFiles.length })}>
      {audioFiles.map((file, index) => (
        <View
          key={file.id}
          style={{
            paddingVertical: 8,
            borderBottomWidth: index < audioFiles.length - 1 ? 1 : 0,
            borderBottomColor: isDark ? "#444" : "#eee",
          }}
        >
          <Text style={[styles.text, { fontWeight: "600", marginBottom: 2 }]} numberOfLines={1}>
            {file.filename}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
              Duration: {file.duration ? formatTime(file.duration) : "Unknown"}
            </Text>
            {file.size && (
              <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
                Size: {(file.size / 1024 / 1024).toFixed(1)} MB
              </Text>
            )}
            {file.downloadInfo?.isDownloaded && (
              <Text style={[styles.text, { fontSize: 12, color: "#007AFF" }]}>
                ⬇ Downloaded
              </Text>
            )}
          </View>
        </View>
      ))}
    </CollapsibleSection>
  );
}
