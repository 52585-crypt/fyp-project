import { Pressable, StyleSheet, View } from "react-native";
import { tapFeedback } from "../haptics";
import { tokens } from "../tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type Option<T extends string> = { value: T; label: string; icon?: IconName };

/** Two or three mutually exclusive views, e.g. "Map | List". Pill track with the selected segment raised. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: {
  options: readonly Option<T>[]; value: T; onChange: (value: T) => void; accessibilityLabel: string;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityLabel={o.label} accessibilityState={{ selected: on }}
            onPress={() => { if (!on) { tapFeedback(); onChange(o.value); } }} style={[styles.segment, on && styles.on]}>
            {o.icon ? <Icon name={o.icon} size={tokens.sizes.iconSmall} color={on ? "primary" : "muted"} /> : null}
            <Text variant="captionStrong" color={on ? "primary" : "muted"}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row", alignSelf: "center", padding: tokens.space.xxs, gap: tokens.space.xxs,
    borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface, ...tokens.shadow.card
  },
  segment: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: tokens.space.xs,
    minHeight: tokens.sizes.buttonSmall, paddingHorizontal: tokens.space.lg, borderRadius: tokens.radius.pill
  },
  on: { backgroundColor: tokens.color.primarySoft }
});
