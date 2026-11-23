import { StyleSheet, View } from "react-native";
import { LocationMapPreview } from "../../components/LocationMapPreview";
import type { MapPreviewProps } from "../../components/LocationMapPreview.shared";
import { tokens } from "../tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

type Props = Partial<MapPreviewProps> & {
  /** Floating chip, e.g. "12 min away" or "12.4 km · 22 min". */
  badge?: string | null;
  height?: number;
  emptyLabel?: string;
};

/** Rounded map preview (wraps the platform map renderer) with an optional floating ETA chip. */
export function MapCard({ badge, height = tokens.sizes.map, emptyLabel = "Waiting for map location", pickup, ...map }: Props) {
  return (
    <View style={[styles.card, { height }]}>
      {pickup ? (
        <LocationMapPreview pickup={pickup} {...map} />
      ) : (
        <View style={styles.empty}>
          <Icon name="map-outline" color="primary" size={tokens.sizes.iconLarge} />
          <Text variant="bodySmall" color="muted">{emptyLabel}</Text>
        </View>
      )}
      {badge ? (
        <View style={styles.badge} pointerEvents="none">
          <Text variant="captionStrong">{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.card, overflow: "hidden", backgroundColor: tokens.color.surfaceAlt,
    borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space.sm },
  badge: {
    position: "absolute", top: tokens.space.md, right: tokens.space.md, backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.sm, paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.sm, ...tokens.shadow.card
  }
});
