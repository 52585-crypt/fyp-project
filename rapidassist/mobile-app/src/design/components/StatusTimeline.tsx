import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

export type TimelineState = "done" | "current" | "todo";
export type TimelineItem = { key: string; label: string; time?: string | null; state: TimelineState };

/** Vertical status list (Trip Status / Order Status in mockups). */
export function StatusTimeline({ items }: { items: ReadonlyArray<TimelineItem> }) {
  return (
    <View accessibilityRole="list">
      {items.map((item, i) => (
        <View key={item.key} style={styles.row} accessible accessibilityLabel={`${item.label}, ${item.state === "done" ? "done" : item.state === "current" ? "in progress" : "pending"}`}>
          <View style={styles.rail}>
            <View style={[styles.dot, styles[item.state]]}>
              {item.state === "done" ? <Icon name="checkmark" size={tokens.size.caption} color="onPrimary" /> : null}
              {item.state === "current" ? <View style={styles.inner} /> : null}
            </View>
            {i < items.length - 1 ? <View style={[styles.line, item.state === "done" && styles.lineDone]} /> : null}
          </View>
          <Text variant={item.state === "todo" ? "bodySmall" : "bodySmallStrong"} color={item.state === "todo" ? "muted" : "text"} style={styles.label}>
            {item.label}
          </Text>
          <Text variant="caption" color="muted">{item.time ?? (item.state === "todo" ? "–" : "")}</Text>
        </View>
      ))}
    </View>
  );
}

const d = tokens.sizes.timelineDot;
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: tokens.space.md, minHeight: d + tokens.space.lg },
  rail: { alignItems: "center", width: d },
  dot: { width: d, height: d, borderRadius: d / 2, alignItems: "center", justifyContent: "center" },
  done: { backgroundColor: tokens.color.success },
  current: { backgroundColor: tokens.color.surface, borderWidth: tokens.sizes.border + 1, borderColor: tokens.color.primary },
  todo: { backgroundColor: tokens.color.border },
  inner: { width: d / 2.5, height: d / 2.5, borderRadius: d, backgroundColor: tokens.color.primary },
  line: { flex: 1, width: 2, backgroundColor: tokens.color.border, marginVertical: tokens.space.xxs },
  lineDone: { backgroundColor: tokens.color.success },
  label: { flex: 1 }
});
