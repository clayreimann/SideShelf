import { useThemedStyles } from "@/lib/theme";
import React from "react";
import { Text } from "react-native";

interface TitleSectionProps {
  title: string;
}

export default function TitleSection({ title }: TitleSectionProps) {
  const { styles } = useThemedStyles();

  return (
    <Text
      style={[
        styles.text,
        {
          fontSize: 24,
          fontWeight: "bold",
          marginBottom: 8,
          textAlign: "center",
        },
      ]}
    >
      {title}
    </Text>
  );
}
