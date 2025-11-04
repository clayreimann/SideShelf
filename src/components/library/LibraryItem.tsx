import CoverImage from "@/components/ui/CoverImange";
import { useThemedStyles } from "@/lib/theme";
import { LibraryItemDisplayRow } from "@/types/components";
import { Link } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import AuthorIcon from "../icons/AuthorIcon";
import NarratorIcon from "../icons/NarratorIcon";
interface LibraryItemProps {
  item: LibraryItemDisplayRow;
  variant?: "grid" | "list";
}

export function GridItem({ item }: { item: LibraryItemDisplayRow }) {
  const { colors } = useThemedStyles();
  return (
    <Link
      href={{ pathname: "/(tabs)/library/[item]", params: { item: item.id } }}
      asChild
    >
      <Pressable style={{ width: "30%", aspectRatio: 1, marginBottom: 12 }}>
        <View
          style={{
            flex: 1,
            borderRadius: 6,
            backgroundColor: colors.coverBackground,
            overflow: "hidden",
          }}
        >
          <CoverImage uri={item.coverUri} title={item.title} fontSize={12} />
        </View>
      </Pressable>
    </Link>
  );
}

export function ListItem({ item }: { item: LibraryItemDisplayRow }) {
  const { colors } = useThemedStyles();
  return (
    <Link
      href={{ pathname: "/(tabs)/library/[item]", params: { item: item.id } }}
      asChild
    >
      <Pressable
        style={{
          flexDirection: "row",
          backgroundColor: colors.background,
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: "row", width: "100%", padding: 8 }}>
          <View
            style={{
              width: 70,
              height: 70,
              borderRadius: 4,
              backgroundColor: colors.coverBackground,
              overflow: "hidden",
              marginRight: 12,
            }}
          >
            <CoverImage uri={item.coverUri} title={item.title} fontSize={24} />
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 4,
              }}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flexDirection: "column", flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <AuthorIcon style={{ marginRight: 4 }} />
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      marginBottom: 2,
                    }}
                    numberOfLines={1}
                  >
                    {item.author}
                  </Text>
                </View>
                {item.narrator && (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <NarratorIcon style={{ marginRight: 4 }} />
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        marginBottom: 2,
                      }}
                      numberOfLines={1}
                    >
                      {item.narrator}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: "column", alignItems: "flex-end" }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                  }}
                >
                  {item.publishedYear}
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 12,
                  }}
                >
                  {item.duration && item.duration > 0
                    ? formatDuration(item.duration)
                    : ""}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default function ApiLibraryItem({
  item,
  variant = "grid",
}: LibraryItemProps) {
  return variant === "grid" ? (
    <GridItem item={item} />
  ) : (
    <ListItem item={item} />
  );
}
