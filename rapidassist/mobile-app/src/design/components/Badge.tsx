import { StyleSheet, View } from "react-native";
import { tokens, type ColorToken } from "../tokens";
import { Text } from "./Text";

export type BadgeTone = "primary" | "success" | "warning" | "danger" | "neutral" | "inverse";

const toneColors: Record<BadgeTone, { bg: ColorToken; fg: ColorToken }> = {
  primary: { bg: "primarySoft", fg: "primary" },
  success: { bg: "successSoft", fg: "success" },
  warning: { bg: "warningSoft", fg: "warningText" },
  danger: { bg: "dangerSoft", fg: "danger" },
  neutral: { bg: "surfaceAlt", fg: "muted" },
  inverse: { bg: "surface", fg: "primary" }
};

/** Small pill label: status chips, plate numbers, "New". */
export function Badge({ label, tone = "primary" }: { label: string; tone?: BadgeTone }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.base, { backgroundColor: tokens.color[c.bg] }]}>
      <Text variant="captionStrong" color={c.fg} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: "flex-start", paddingHorizontal: tokens.space.sm, paddingVertical: tokens.space.xxs, borderRadius: tokens.radius.pill }
});
