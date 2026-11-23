import { Pressable, StyleSheet, View } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens, type ColorToken } from "../tokens";
import { Icon, type IconName } from "./Icon";

type Props = {
  icon: IconName;
  label: string;
  onPress?: () => void;
  tone?: "plain" | "soft" | "solid" | "outline";
  color?: ColorToken;
  size?: number;
  badge?: boolean;
  disabled?: boolean;
};

/** Circular icon-only button. `label` is required for screen readers. */
export function IconButton({ icon, label, onPress, tone = "outline", color, size = tokens.sizes.iconButton, badge, disabled }: Props) {
  const iconColor: ColorToken = color ?? (tone === "solid" ? "onPrimary" : "primary");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={(tokens.sizes.touchMin - size) / 2 > 0 ? (tokens.sizes.touchMin - size) / 2 : 0}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        styles[tone],
        pressed && { opacity: tokens.opacity.pressed },
        disabled && { opacity: tokens.opacity.disabled }
      ]}
    >
      <Icon name={icon} color={iconColor} />
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  plain: { backgroundColor: tokens.color.transparent },
  soft: { backgroundColor: tokens.color.primarySoft },
  solid: { backgroundColor: tokens.color.primary },
  outline: { backgroundColor: tokens.color.surface, borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border },
  badge: {
    position: "absolute", top: tokens.space.sm, right: tokens.space.sm,
    width: tokens.space.sm, height: tokens.space.sm, borderRadius: tokens.space.xs, backgroundColor: tokens.color.danger
  }
});
