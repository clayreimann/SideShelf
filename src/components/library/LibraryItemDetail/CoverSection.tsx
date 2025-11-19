import CoverImage from "@/components/ui/CoverImange";
import React from "react";
import { View } from "react-native";

interface CoverSectionProps {
  coverUri: string | null;
  title: string;
  imageSize: number;
}

export default function CoverSection({ coverUri, title, imageSize }: CoverSectionProps) {
  return (
    <View style={{ alignItems: "center", marginBottom: 16 }}>
      <View
        style={{
          height: imageSize,
          width: imageSize,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <CoverImage uri={coverUri} title={title} fontSize={14} />
      </View>
    </View>
  );
}
