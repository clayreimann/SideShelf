import CoverImage from "@/components/ui/CoverImange";
import ProgressBar from "@/components/ui/ProgressBar";
import { type HomeScreenItem } from "@/db/helpers/homeScreen";
import { useThemedStyles } from "@/lib/theme";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

interface HomeItemProps {
  item: HomeScreenItem;
}

export default function HomeItem({ item }: HomeItemProps) {
  const router = useRouter();
  const { styles, colors } = useThemedStyles();
  return (
    <Pressable
      onPress={() => router.push(`/home/item/${item.id}`)}
      accessibilityRole="button"
      accessibilityHint={`Open details for ${item.title}`}
    >
      <View
        style={{
          flexDirection: "row",
          padding: 12,
          marginBottom: 8,
          alignContent: "center",
          alignItems: "center",
        }}
      >
        <View style={{ width: 64, height: 64, borderRadius: 4, overflow: "hidden" }}>
          <CoverImage
            uri={item.imageUrl ?? null}
            title={item.title}
            fontSize={12}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 12, flexDirection: "column" }}>
          <Text
            style={[styles.text, { fontWeight: "600", fontSize: 16 }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={[styles.text, { opacity: 0.7, fontSize: 14, marginTop: 2 }]}
            numberOfLines={1}
          >
            {item.authorName}
          </Text>
          {item.seriesName && (
            <Text
              style={[
                styles.text,
                { opacity: 0.6, fontSize: 12, marginTop: 2 },
              ]}
              numberOfLines={1}
            >
              {item.seriesName}
            </Text>
          )}
          {item.progress !== undefined && item.progress > 0 && (
            <View style={{ marginTop: 8 }}>
              <ProgressBar
                progress={item.progress}
                variant="small"
                showPercentage={true}
              />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
