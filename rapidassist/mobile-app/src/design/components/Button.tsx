import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens, type ColorToken } from "../tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost" | "light";

type Props = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "large" | "small";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const look: Record<ButtonVariant, { bg: ColorToken; fg: ColorToken; border: ColorToken }> = {
  primary: { bg: "primary", fg: "onPrimary", border: "primary" },
  secondary: { bg: "primarySoft", fg: "primary", border: "primarySoft" },
  outline: { bg: "surface", fg: "primary", border: "primary" },
  danger: { bg: "surface", fg: "danger", border: "danger" },
  ghost: { bg: "transparent", fg: "primary", border: "transparent" },
  light: { bg: "surface", fg: "primary", border: "surface" }
};

/** 54px primary action button (40px when size="small"). */
export function Button({
  title, onPress, variant = "primary", size = "large", icon, loading, disabled, fullWidth = true, accessibilityHint, style, testID
}: Props) {
  const c = look[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={({ pressed }) => [
        styles.base,
        size === "small" ? styles.small : styles.large,
        { backgroundColor: tokens.color[c.bg], borderColor: tokens.color[c.border] },
        fullWidth ? styles.full : styles.hug,
        pressed && !inactive && { opacity: tokens.opacity.pressed },
        inactive && { opacity: tokens.opacity.disabled },
        style
      ]}
    >
      {loading ? <ActivityIndicator color={tokens.color[c.fg]} /> : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} color={c.fg} size={tokens.sizes.icon} /> : null}
          <Text variant={size === "small" ? "bodySmallStrong" : "button"} color={c.fg} numberOfLines={1}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", borderWidth: tokens.sizes.border, borderRadius: tokens.radius.md },
  large: { minHeight: tokens.sizes.button, paddingHorizontal: tokens.space.xl },
  small: { minHeight: tokens.sizes.buttonSmall, paddingHorizontal: tokens.space.lg, borderRadius: tokens.radius.sm },
  full: { alignSelf: "stretch" },
  hug: { alignSelf: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm }
});
