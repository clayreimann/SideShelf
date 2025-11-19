import { useThemedStyles } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";

interface GenresTagsSectionProps {
  genres: string[];
  tags: string[];
}

export default function GenresTagsSection({ genres, tags }: GenresTagsSectionProps) {
  const { isDark } = useThemedStyles();

  if (genres.length === 0 && tags.length === 0) {
    return null;
  }

  return (
    <>
      {genres.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginBottom: 8,
            justifyContent: "center",
          }}
        >
          {genres.map((g: string, idx: number) => (
            <View
              key={g + idx}
              style={{
                backgroundColor: isDark ? "#333" : "#eee",
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2,
                margin: 2,
              }}
            >
              <Text style={{ fontSize: 12, color: isDark ? "#ccc" : "#333" }}>{g}</Text>
            </View>
          ))}
        </View>
      )}
      {tags.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginBottom: 8,
            justifyContent: "center",
          }}
        >
          {tags.map((t: string, idx: number) => (
            <View
              key={t + idx}
              style={{
                backgroundColor: isDark ? "#1a4f6e" : "#d0eaff",
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2,
                margin: 2,
              }}
            >
              <Text style={{ fontSize: 12, color: isDark ? "#ccc" : "#333" }}>{t}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}
