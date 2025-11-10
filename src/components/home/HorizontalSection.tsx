import CoverItem from "@/components/home/CoverItem";
import { type HomeScreenItem } from "@/db/helpers/homeScreen";
import { useThemedStyles } from "@/lib/theme";
import { FlatList, Text, View } from "react-native";

interface HorizontalSectionProps {
  title: string;
  data: HomeScreenItem[];
  showProgress?: boolean;
}

/**
 * Horizontal scrolling section for cover-based home layout
 * Displays items in a single horizontal row with no limit
 */
export default function HorizontalSection({
  title,
  data,
  showProgress = false,
}: HorizontalSectionProps) {
  const { styles, colors } = useThemedStyles();

  if (data.length === 0) {
    return null;
  }

  return (
    <View style={{ width: "100%", marginBottom: 24 }}>
      {/* Section Title */}
      <Text
        style={[
          styles.text,
          {
            fontSize: 20,
            fontWeight: "700",
            paddingHorizontal: 16,
            marginBottom: 12,
            backgroundColor: colors.background,
          },
        ]}
      >
        {title}
      </Text>

      {/* Horizontal Scrolling List */}
      <FlatList
        data={data}
        renderItem={({ item }) => <CoverItem item={item} showProgress={showProgress} />}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
        }}
      />
    </View>
  );
}
