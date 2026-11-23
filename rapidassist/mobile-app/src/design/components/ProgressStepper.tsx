import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Horizontal job progress (Accepted → On The Way → Arrived → Completed). */
export function ProgressStepper({ steps, current }: { steps: ReadonlyArray<string>; current: number }) {
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current] ?? ""}`}>
      <View style={styles.track}>
        {steps.map((step, i) => (
          <View key={step} style={styles.cell}>
            {i > 0 ? <View style={[styles.line, styles.lineLeft, i <= current && styles.lineOn]} /> : null}
            {i < steps.length - 1 ? <View style={[styles.line, styles.lineRight, i < current && styles.lineOn]} /> : null}
            <View style={[styles.dot, i < current ? styles.done : i === current ? styles.current : styles.todo]}>
              {i < current ? <Icon name="checkmark" size={tokens.size.micro} color="onPrimary" /> : null}
              {i === current ? <View style={styles.inner} /> : null}
            </View>
            <Text variant="micro" color={i <= current ? "text" : "muted"} align="center" numberOfLines={2} style={styles.label}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const d = tokens.sizes.stepDot;
const styles = StyleSheet.create({
  wrap: { width: "100%" },
  track: { flexDirection: "row" },
  cell: { flex: 1, alignItems: "center", gap: tokens.space.xs },
  line: { position: "absolute", top: d / 2 - 1, height: 2, backgroundColor: tokens.color.border },
  lineLeft: { left: 0, right: "50%" },
  lineRight: { left: "50%", right: 0 },
  lineOn: { backgroundColor: tokens.color.primary },
  dot: { width: d, height: d, borderRadius: d / 2, alignItems: "center", justifyContent: "center" },
  done: { backgroundColor: tokens.color.primary },
  current: { backgroundColor: tokens.color.surface, borderWidth: 2, borderColor: tokens.color.primary },
  todo: { backgroundColor: tokens.color.border },
  inner: { width: d / 2.5, height: d / 2.5, borderRadius: d, backgroundColor: tokens.color.primary },
  label: { paddingHorizontal: tokens.space.xxs }
});
