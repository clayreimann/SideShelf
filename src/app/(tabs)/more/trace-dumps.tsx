import TraceDumps from "@/components/diagnostics/TraceDumps";
import { useThemedStyles } from "@/lib/theme";
import { ScrollView } from "react-native";

export default function TraceDumpsScreen() {
  const { styles } = useThemedStyles();
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <TraceDumps />
    </ScrollView>
  );
}
