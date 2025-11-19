import { CollapsibleSection } from "@/components/ui";
import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import React, { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import RenderHtml from "react-native-render-html";

const HTMLTagsStyles = {
  p: { marginBottom: 12, lineHeight: 24 },
  div: { marginBottom: 8 },
  br: { marginBottom: 8 },
  b: { fontWeight: "bold" as const },
  strong: { fontWeight: "bold" as const },
  i: { fontStyle: "italic" as const },
};

interface DescriptionSectionProps {
  description: string;
}

export default function DescriptionSection({ description }: DescriptionSectionProps) {
  const { colors } = useThemedStyles();
  const { width } = useWindowDimensions();

  const htmlSource = useMemo(() => ({ html: description }), [description]);
  const baseStyle = useMemo(() => ({ color: colors.textPrimary, fontSize: 16 }), [colors]);

  if (!description) {
    return null;
  }

  return (
    <CollapsibleSection title={translate("libraryItem.description")} defaultExpanded={true}>
      <RenderHtml
        contentWidth={width - 64}
        source={htmlSource}
        baseStyle={baseStyle}
        tagsStyles={HTMLTagsStyles}
      />
    </CollapsibleSection>
  );
}
