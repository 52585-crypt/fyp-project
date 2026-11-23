import { Pressable, StyleSheet, View } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Checkbox row (fuel safety checklist, extra work items). */
export function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => { tapFeedback(); onChange(!checked); }}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.on]}>{checked ? <Icon name="checkmark" size={tokens.sizes.iconSmall} color="onPrimary" /> : null}</View>
      <Text variant="bodySmallMedium" style={styles.flex}>{label}</Text>
    </Pressable>
  );
}

const box = tokens.sizes.timelineDot + tokens.space.xxs;
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, minHeight: tokens.sizes.touchMin - tokens.space.sm },
  box: {
    width: box, height: box, borderRadius: tokens.radius.xs, borderWidth: tokens.sizes.border, borderColor: tokens.color.borderStrong,
    alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.surface
  },
  on: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  flex: { flex: 1 }
});
