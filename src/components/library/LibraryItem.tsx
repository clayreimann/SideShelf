import CoverImage from "@/components/ui/CoverImange";
import { useThemedStyles } from "@/lib/theme";
import { LibraryItemDisplayRow } from "@/types/components";
import { Link } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
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
  const { colors, isDark } = useThemedStyles();
  return (
    <Link
      href={{ pathname: "/(tabs)/library/[item]", params: { item: item.id } }}
      asChild
    >
      <Pressable
        style={{
          flexDirection: "row",
          backgroundColor: colors.background,
          marginHorizontal: 12,
          marginBottom: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2,
          elevation: 2,
        }}
      >
        <View style={{ flexDirection: "row", width: "100%", padding: 8 }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 4,
              backgroundColor: isDark ? "#333" : "#f0f0f0",
              overflow: "hidden",
              marginRight: 12,
            }}
          >
            <CoverImage uri={item.coverUri} title={item.title} fontSize={24} />
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text
              style={{
                color: isDark ? "#fff" : "#000",
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 4,
              }}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <Text
              style={{
                color: isDark ? "#aaa" : "#666",
                fontSize: 14,
                marginBottom: 2,
              }}
              numberOfLines={1}
            >
              {item.author}
            </Text>
            {item.narrator && (
              <Text
                style={{
                  color: isDark ? "#888" : "#888",
                  fontSize: 12,
                }}
                numberOfLines={1}
              >
                Narrated by {item.narrator}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </Link>
  );
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
