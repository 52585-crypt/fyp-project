import { StyleSheet, View, useWindowDimensions } from "react-native";
import { tokens, type ColorToken } from "../tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/** Small metric box (ETA / Distance / Today's jobs / Earnings). */
export function StatTile({ label, value, caption, icon, iconColor = "primary" }: {
  label: string; value: string; caption?: string; icon?: IconName; iconColor?: ColorToken;
}) {
  // On narrow phones (≈360dp) drop the icon so values like "Rs. 32,100" fit.
  const compact = useWindowDimensions().width < tokens.sizes.compactWidth;
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}${caption ? `, ${caption}` : ""}`}>
      {icon && !compact ? <View style={styles.icon}><Icon name={icon} color={iconColor} /></View> : null}
      <View style={styles.copy}>
        <Text variant="caption" color="muted" numberOfLines={1}>{label}</Text>
        <Text variant="headline" numberOfLines={1}>{value}</Text>
        {caption ? <Text variant="micro" color="muted" numberOfLines={1}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: tokens.space.sm, padding: tokens.space.md,
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border
  },
  icon: {
    width: tokens.sizes.iconTile - tokens.space.xs, height: tokens.sizes.iconTile - tokens.space.xs, borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.primarySoft, alignItems: "center", justifyContent: "center"
  },
  copy: { flex: 1, minWidth: 0, gap: tokens.space.xxs }
});
