import { Pressable, StyleSheet, View } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";
import { Badge } from "./Badge";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type Props = {
  title: string;
  subtitle?: string;
  icon: IconName;
  onPress?: () => void;
  selected?: boolean;
  /** Shows a "Soon" badge and disables the tile. */
  comingSoon?: boolean;
};

/** Square service shortcut for the home grid. */
export function ServiceTile({ title, subtitle, icon, onPress, selected, comingSoon }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={comingSoon ? `${title}, coming soon` : title}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(comingSoon) }}
      disabled={comingSoon}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={({ pressed }) => [styles.tile, selected && styles.selected, pressed && { opacity: tokens.opacity.pressed }]}
    >
      <View style={[styles.icon, comingSoon && styles.iconMuted]}><Icon name={icon} color={comingSoon ? "subtle" : "primary"} size={tokens.sizes.iconLarge - 4} /></View>
      <Text variant="captionStrong" align="center" numberOfLines={1} color={comingSoon ? "muted" : "text"}>{title}</Text>
      {comingSoon ? <Badge label="Soon" tone="neutral" /> : subtitle ? <Text variant="micro" color="muted" align="center" numberOfLines={2}>{subtitle}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: "30%", flexGrow: 1, alignItems: "center", gap: tokens.space.xs, paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.xs, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface,
    borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border
  },
  selected: { backgroundColor: tokens.color.primarySoft, borderColor: tokens.color.primary },
  icon: {
    width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.radius.sm, alignItems: "center",
    justifyContent: "center", backgroundColor: tokens.color.primarySoft
  },
  iconMuted: { backgroundColor: tokens.color.surfaceAlt }
});
