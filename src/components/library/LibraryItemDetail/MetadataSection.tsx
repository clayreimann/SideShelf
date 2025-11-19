import { AuthorIcon, NarratorIcon, SeriesIcon } from "@/components/icons";
import { translate } from "@/i18n";
import { navigateToAuthor, navigateToSeries } from "@/lib/navigation";
import { useThemedStyles } from "@/lib/theme";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

// Helper function to format duration in seconds to readable format (e.g., "12h 30m")
function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  }
  return "";
}

function Separator() {
  const { isDark } = useThemedStyles();
  return (
    <View style={{ marginHorizontal: 12 }}>
      <Text
        style={{
          color: isDark ? "#bbb" : "#444",
          fontSize: 24,
          textAlign: "center",
        }}
      >
        •
      </Text>
    </View>
  );
}

interface MetadataSectionProps {
  author: string;
  narrator: string | null;
  series: string | null;
  duration: number | null | undefined;
  publishedYear: number | null | undefined;
  isDownloaded: boolean;
  authorId: string | null;
  seriesId: string | null;
}

export default function MetadataSection({
  author,
  narrator,
  series,
  duration,
  publishedYear,
  isDownloaded,
  authorId,
  seriesId,
}: MetadataSectionProps) {
  const { styles, isDark } = useThemedStyles();
  const router = useRouter();

  return (
    <View
      style={{
        flexDirection: "column",
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          width: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexShrink: 1,
          }}
          onPress={() => {
            if (authorId) {
              navigateToAuthor(router, authorId);
            }
          }}
          disabled={!authorId}
        >
          <AuthorIcon style={{ marginRight: 8 }} />
          <Text
            style={[
              styles.text,
              {
                textAlign: "center",
                flexShrink: 1,
                textDecorationLine: authorId ? "underline" : "none",
              },
            ]}
          >
            {author}
          </Text>
        </TouchableOpacity>
        {narrator ? (
          <>
            <Separator />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexShrink: 1,
              }}
            >
              <NarratorIcon style={{ marginRight: 8 }} />
              <Text style={[styles.text, { textAlign: "center", flexShrink: 1 }]}>
                {narrator}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      {series ? (
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={() => {
            if (seriesId) {
              navigateToSeries(router, seriesId);
            }
          }}
          disabled={!seriesId}
        >
          <SeriesIcon />
          <Text
            style={[
              styles.text,
              {
                fontStyle: "italic",
                marginBottom: 4,
                marginLeft: 4,
                textAlign: "center",
                textDecorationLine: seriesId ? "underline" : "none",
              },
            ]}
          >
            {series}
          </Text>
        </TouchableOpacity>
      ) : null}
      {/* Duration, Year, and Download Status */}
      {(duration || publishedYear || isDownloaded) && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 4,
            flexWrap: "wrap",
          }}
        >
          {duration && (
            <Text style={[styles.text, { fontSize: 14, opacity: 0.7 }]}>
              {formatDuration(duration)}
            </Text>
          )}
          {publishedYear && (
            <>
              {duration && <Separator />}
              <Text style={[styles.text, { fontSize: 14, opacity: 0.7 }]}>{publishedYear}</Text>
            </>
          )}
          {isDownloaded && (
            <>
              {(duration || publishedYear) && <Separator />}
              <Text style={[styles.text, { fontSize: 14, color: "#34C759" }]}>
                {translate("libraryItem.downloaded")}
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}
