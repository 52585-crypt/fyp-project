import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type Props = {
  label: string;
  value?: string | null;
  icon?: IconName;
  /** Bold value, used for totals. */
  strong?: boolean;
  /** Stack value under label (long addresses). */
  stacked?: boolean;
  valueColor?: "text" | "primary" | "success" | "danger" | "muted";
};

/** Label / value line for summaries (vehicle, location, fuel type...). */
export function InfoRow({ label, value, icon, strong, stacked, valueColor = "text" }: Props) {
  return (
    <View style={[styles.row, stacked && styles.stacked]} accessible accessibilityLabel={`${label}: ${value ?? "not set"}`}>
      <View style={styles.labelWrap}>
        {icon ? <Icon name={icon} color="primary" size={tokens.sizes.iconSmall} /> : null}
        <Text variant="bodySmall" color="muted">{label}</Text>
      </View>
      <Text
        variant={strong ? "bodyStrong" : "bodySmallMedium"}
        color={valueColor}
        style={stacked ? undefined : styles.value}
        numberOfLines={stacked ? 3 : 2}
      >
        {value || "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: tokens.space.md },
  stacked: { flexDirection: "column", gap: tokens.space.xxs },
  labelWrap: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  value: { flexShrink: 1, textAlign: "right" }
});
