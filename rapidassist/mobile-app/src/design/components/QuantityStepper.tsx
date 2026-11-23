import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

/** − value + control. */
export function QuantityStepper({ value, onChange, min = 1, max = 99, unit, label }: {
  value: number; onChange: (next: number) => void; min?: number; max?: number; unit?: string; label: string;
}) {
  return (
    <View style={styles.row} accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ""}`}>
      <IconButton icon="remove" label={`Decrease ${label}`} disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
      <Text variant="display" style={styles.value}>{value}{unit ? <Text variant="headline" color="muted"> {unit}</Text> : null}</Text>
      <IconButton icon="add" label={`Increase ${label}`} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: tokens.space.xl },
  value: { minWidth: tokens.sizes.avatarLarge, textAlign: "center" }
});
