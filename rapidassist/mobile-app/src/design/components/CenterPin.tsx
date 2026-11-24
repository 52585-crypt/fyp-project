import { StyleSheet, View } from "react-native";
import { tokens } from "../tokens";
import { Text } from "./Text";

type Props = { label?: string; tone?: "primary" | "red" };

/**
 * Fixed pin drawn over the exact centre of its parent (the map moves underneath).
 * The pin tip sits on the centre point; the label bubble floats above the head.
 */
export function CenterPin({ label, tone = "primary" }: Props) {
  const color = tone === "red" ? tokens.color.red : tokens.color.primary;
  return (
    <View pointerEvents="none" style={styles.layer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.pin}>
        {label ? <View style={styles.bubble}><Text variant="captionStrong" color="surface" numberOfLines={1}>{label}</Text></View> : null}
        <View style={[styles.head, { backgroundColor: color }]}><View style={styles.core} /></View>
        <View style={[styles.stem, { backgroundColor: color }]} />
        <View style={styles.ground} />
      </View>
    </View>
  );
}

const s = tokens.sizes;
const PIN_TOTAL = s.pin + s.pinStem;

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  // Shift the whole pin up so the stem's tip (not the pin's middle) lands on the centre.
  pin: { alignItems: "center", transform: [{ translateY: -PIN_TOTAL / 2 }] },
  bubble: {
    position: "absolute", bottom: PIN_TOTAL + tokens.space.sm, paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.xs,
    borderRadius: tokens.radius.pill, backgroundColor: tokens.color.ink, maxWidth: s.heroArt * 1.5
  },
  head: {
    width: s.pin, height: s.pin, borderRadius: s.pin / 2, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: tokens.color.surface, ...tokens.shadow.raised
  },
  core: { width: s.pin / 3, height: s.pin / 3, borderRadius: s.pin / 6, backgroundColor: tokens.color.surface },
  stem: { width: 3, height: s.pinStem, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  ground: { position: "absolute", bottom: -3, width: 10, height: 6, borderRadius: 5, backgroundColor: tokens.color.shadowSoft }
});
