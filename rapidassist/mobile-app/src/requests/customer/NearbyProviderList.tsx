import { ScrollView, StyleSheet } from "react-native";
import { Card, EmptyState, SkeletonCard, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { t, tp } from "../../i18n/translate";
import type { Coordinate } from "../../utils/distance";
import { sortNearbyProviders } from "../nearbyProviderMarkers";
import type { NearbyProvider, RequestCategory } from "../requests.types";
import { getServiceTitle } from "../serviceCatalog";
import { useProviderEtas } from "../useProviderEtas";
import { NearbyProviderCard } from "./NearbyProviderCard";

type Props = {
  /** null while the first load is in flight. */
  providers: readonly NearbyProvider[] | null;
  /** The last refresh failed: an empty list then means "unknown", not "nobody nearby". */
  offline?: boolean;
  category: RequestCategory;
  pickup: Coordinate | null;
  onRequest: () => void;
  /** Space kept clear at the top for the map top bar and the view toggle. */
  topInset: number;
};

/** List view of nearby providers: nearest band first, then best rated. Same card as a marker tap. */
export function NearbyProviderList({ providers, offline, category, pickup, onRequest, topInset }: Props) {
  const sorted = providers ? sortNearbyProviders(providers) : null;
  const eta = useProviderEtas(sorted, pickup, true);
  return (
    <ScrollView style={styles.fill} contentContainerStyle={[styles.body, { paddingTop: topInset }]}
      accessibilityLabel={tp("nearby", "listLabel", { service: getServiceTitle(category) })}>
      {sorted === null ? (
        <><SkeletonCard /><SkeletonCard /></>
      ) : sorted.length === 0 && offline ? (
        <EmptyState icon="cloud-offline-outline" title={t("nearby", "offlineTitle")} message={t("nearby", "offlineMessage")} />
      ) : sorted.length === 0 ? (
        <EmptyState icon="map-outline" title={t("nearby", "emptyTitle")} message={t("nearby", "emptyMessage")} />
      ) : (
        <>
          <Text variant="caption" color="muted">
            {tp("nearby", "listSummary", { count: sorted.length })}
          </Text>
          {sorted.map((p) => (
            <Card key={p.id}>
              <NearbyProviderCard provider={p} fallbackCategory={category} eta={eta(p.id)} onRequest={onRequest} />
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: tokens.color.surfaceAlt },
  body: { gap: tokens.space.md, paddingHorizontal: tokens.space.screen, paddingBottom: tokens.space.xl }
});
