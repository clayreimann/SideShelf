import CoverImage from "@/components/ui/CoverImange";
import ProgressBar from "@/components/ui/ProgressBar";
import { type HomeScreenItem } from "@/db/helpers/homeScreen";
import { useThemedStyles } from "@/lib/theme";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

interface CoverItemProps {
  item: HomeScreenItem;
  showProgress?: boolean;
}

/**
 * Cover-based home item component for horizontal scrolling layout
 * Displays a larger cover image with title, author, and optional progress bar
 */
export default function CoverItem({ item, showProgress = false }: CoverItemProps) {
  const router = useRouter();
  const { styles, colors } = useThemedStyles();

  const coverSize = 140;

  return (
    <Pressable
      onPress={() => router.push(`/home/item/${item.id}`)}
      accessibilityRole="button"
      accessibilityHint={`Open details for ${item.title}`}
      style={{ marginRight: 16 }}
    >
      <View style={{ width: coverSize }}>
        {/* Cover Image */}
        <View
          style={{
            width: coverSize,
            height: coverSize,
            borderRadius: 8,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}
        >
          <CoverImage uri={item.imageUrl ?? null} title={item.title} fontSize={16} />
        </View>

        {/* Progress Bar - only shown for items with progress */}
        {showProgress && item.progress !== undefined && item.progress > 0 && (
          <View style={{ marginTop: 8, marginBottom: 4 }}>
            <ProgressBar
              progress={item.progress}
              variant="small"
              showPercentage={false}
              height={4}
            />
          </View>
        )}

        {/* Title */}
        <Text
          style={[
            styles.text,
            {
              fontWeight: "600",
              fontSize: 14,
              marginTop: showProgress && item.progress ? 4 : 8,
            },
          ]}
          numberOfLines={2}
        >
          {item.title}
        </Text>

        {/* Author */}
        <Text
          style={[
            styles.text,
            {
              opacity: 0.7,
              fontSize: 12,
              marginTop: 2,
            },
          ]}
          numberOfLines={1}
        >
          {item.authorName}
        </Text>
      </View>
    </Pressable>
  );
}
