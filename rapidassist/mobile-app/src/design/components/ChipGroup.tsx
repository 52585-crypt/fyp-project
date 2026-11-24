import { Pressable, StyleSheet, View } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type Chip<T extends string> = { value: T; label: string; icon?: IconName };

type Props<T extends string> = {
  options: ReadonlyArray<Chip<T>>;
  value: T | null;
  onChange: (value: T) => void;
  /** Fixed number of equal columns (mockup grids use 2). Omit for wrapping pills. */
  columns?: number;
  accessibilityLabel?: string;
};

/** Single-select chips: problem type, fuel type, quantity, vehicle type. */
export function ChipGroup<T extends string>({ options, value, onChange, columns, accessibilityLabel }: Props<T>) {
  const basis = columns ? `${100 / columns - 3}%` as const : undefined;
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => { tapFeedback(); onChange(o.value); }}
            style={[styles.chip, basis ? { flexBasis: basis, flexGrow: 1 } : null, selected && styles.selected]}
          >
            {o.icon ? <Icon name={o.icon} color={selected ? "primary" : "muted"} size={tokens.sizes.icon} /> : null}
            <Text variant={selected ? "bodySmallStrong" : "bodySmallMedium"} color={selected ? "primary" : "text"} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  chip: {
    minHeight: tokens.sizes.buttonSmall + tokens.space.xs, paddingHorizontal: tokens.space.md, borderRadius: tokens.radius.control,
    borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border, backgroundColor: tokens.color.surface,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: tokens.space.sm
  },
  selected: { borderColor: tokens.color.primary, borderWidth: tokens.sizes.border, backgroundColor: tokens.color.primarySoft }
});
