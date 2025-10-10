import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { formatTime } from "@/lib/helpers/formatters";
import { useThemedStyles } from "@/lib/theme";
import { ApiBookChapter } from "@/types/api";
import { Text, View } from "react-native";

type ChapterListProps = {
  chapters: ApiBookChapter[];
};

export default function ChapterList({ chapters }: ChapterListProps) {
  const { styles, isDark } = useThemedStyles();
  if (chapters.length === 0) {
    return (
      <View>
        <Text style={[styles.text, { fontStyle: "italic", opacity: 0.7 }]}>
          No chapters available.
        </Text>
      </View>
    );
  }

  return (
    <CollapsibleSection title={`Chapters (${chapters.length})`}>
      {chapters.map((chapter, index) => (
        <View
          key={chapter.id}
          style={{
            paddingVertical: 8,
            borderBottomWidth: index < chapters.length - 1 ? 1 : 0,
            borderBottomColor: isDark ? "#444" : "#eee",
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[styles.text, { fontWeight: "600", marginBottom: 2 }]}>
              {chapter.title}
            </Text>
            <Text>{formatTime(chapter.end - chapter.start)}</Text>
          </View>
          <Text style={[styles.text, { fontSize: 12, opacity: 0.7 }]}>
            {formatTime(chapter.start)} - {formatTime(chapter.end)}
          </Text>
        </View>
      ))}
    </CollapsibleSection>
  );
}
