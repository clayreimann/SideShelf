import TraceDumps from "@/components/diagnostics/TraceDumps";
import { useThemedStyles } from "@/lib/theme";
import { ScrollView } from "react-native";

export default function TraceDumpsScreen() {
  const { colors } = useThemedStyles();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      <TraceDumps />
    </ScrollView>
  );
}
