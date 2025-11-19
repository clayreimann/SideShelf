import { ProgressBar } from "@/components/ui";
import { useThemedStyles } from "@/lib/theme";
import { MediaProgressRow } from "@/types/database";
import React from "react";
import { View } from "react-native";

interface ProgressSectionProps {
  progress: MediaProgressRow;
}

export default function ProgressSection({ progress }: ProgressSectionProps) {
  const { isDark } = useThemedStyles();

  return (
    <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
      <View
        style={{
          backgroundColor: isDark ? "#333" : "#f5f5f5",
          borderRadius: 8,
          padding: 12,
        }}
      >
        <ProgressBar
          progress={progress.progress || 0}
          variant="medium"
          showTimeLabels={!!(progress.currentTime && progress.duration)}
          currentTime={progress.currentTime || undefined}
          duration={progress.duration || undefined}
          showPercentage={true}
        />
      </View>
    </View>
  );
}
