import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";
import { Badge } from "./Badge";
import { Text } from "./Text";

type Props = {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** e.g. "Coming soon" */
  tag?: string;
  children?: ReactNode;
};

/** Selectable option card with a radio dot (payment method). */
export function RadioCard({ title, subtitle, selected, onPress, disabled, tag, children }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      accessibilityLabel={tag ? `${title}, ${tag}` : title}
      disabled={disabled}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={[styles.card, selected && styles.selected, disabled && { opacity: tokens.opacity.disabled }]}
    >
      <View style={[styles.dot, selected && styles.dotOn]}>{selected ? <View style={styles.dotInner} /> : null}</View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong">{title}</Text>
          {tag ? <Badge label={tag} tone="neutral" /> : null}
        </View>
        {subtitle ? <Text variant="caption" color="muted">{subtitle}</Text> : null}
        {children}
      </View>
    </Pressable>
  );
}

const dot = tokens.sizes.timelineDot + tokens.space.xxs;
const styles = StyleSheet.create({
  card: {
    flexDirection: "row", gap: tokens.space.md, alignItems: "flex-start", padding: tokens.space.lg,
    borderRadius: tokens.radius.md, borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border, backgroundColor: tokens.color.surface
  },
  selected: { borderColor: tokens.color.primary, borderWidth: tokens.sizes.border, backgroundColor: tokens.color.primarySoft },
  dot: {
    width: dot, height: dot, borderRadius: dot / 2, borderWidth: tokens.sizes.border, borderColor: tokens.color.borderStrong,
    alignItems: "center", justifyContent: "center", marginTop: tokens.space.xxs
  },
  dotOn: { borderColor: tokens.color.primary },
  dotInner: { width: dot / 2, height: dot / 2, borderRadius: dot / 4, backgroundColor: tokens.color.primary },
  copy: { flex: 1, gap: tokens.space.xxs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, flexWrap: "wrap" }
});
