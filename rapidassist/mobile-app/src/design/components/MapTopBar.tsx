import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "../tokens";
import { Text } from "./Text";

/** Height the top bar occupies below the safe-area inset. */
export const MAP_TOP_BAR_HEIGHT = tokens.sizes.iconButton + tokens.space.lg;

/**
 * Everything the top bar covers from the screen's top edge: the status bar (safe-area inset, large on Android)
 * plus the bar. Map screens pass this to MapCanvas `inset.top`, so map controls (zoom +/−) and fitted content
 * sit below the bar instead of behind it.
 */
export function useMapTopInset() {
  return useSafeAreaInsets().top + MAP_TOP_BAR_HEIGHT;
}

/** Floating controls over a full-bleed map: left / centre / right slots under the status bar. */
export function MapTopBar({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.bar, { paddingTop: insets.top + tokens.space.sm }]}>
      <View pointerEvents="box-none" style={styles.side}>{left}</View>
      <View pointerEvents="box-none" style={styles.center}>{center}</View>
      <View pointerEvents="box-none" style={[styles.side, styles.end]}>{right}</View>
    </View>
  );
}

/** Frosted pill label for the top bar centre (e.g. "Set pickup", a greeting). */
export function MapPill({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.pill}>
      <Text variant="bodySmallStrong" numberOfLines={1}>{title}</Text>
      {subtitle ? <Text variant="caption" color="muted" numberOfLines={1}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: tokens.space.sm,
    paddingHorizontal: tokens.space.lg, width: "100%", maxWidth: tokens.sizes.maxContent, alignSelf: "center", marginHorizontal: "auto"
  },
  side: { minWidth: tokens.sizes.iconButton, flexDirection: "row", gap: tokens.space.sm },
  end: { justifyContent: "flex-end" },
  center: { flex: 1, alignItems: "center" },
  pill: {
    maxWidth: "100%", alignItems: "center", paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surfaceGlass, ...tokens.shadow.card
  }
});
