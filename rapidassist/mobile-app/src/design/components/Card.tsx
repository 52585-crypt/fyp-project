import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";

type Props = {
  children: ReactNode;
  tone?: "surface" | "soft" | "selected";
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** White rounded (18px) container. `soft` = lavender info panel, `selected` = primary outline. */
export function Card({ children, tone = "surface", padded = true, onPress, accessibilityLabel, style, testID }: Props) {
  const body = [styles.base, styles[tone], padded && styles.padded, style];
  if (!onPress) return <View style={body} testID={testID}>{children}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [body, pressed && { opacity: tokens.opacity.pressed }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: tokens.radius.card, gap: tokens.space.md, borderWidth: tokens.sizes.hairline },
  padded: { padding: tokens.space.lg },
  surface: { backgroundColor: tokens.color.surface, borderColor: tokens.color.border, ...tokens.shadow.card },
  soft: { backgroundColor: tokens.color.primarySoft, borderColor: tokens.color.primarySoft },
  selected: { backgroundColor: tokens.color.primarySoft, borderColor: tokens.color.primary, borderWidth: tokens.sizes.border }
});
