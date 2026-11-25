import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { Avatar, Badge, Banner, Button, Icon, Skeleton, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { hasOperationalCoordinates } from "../../services/locationMapPolicy";
import { formatCurrency } from "../../utils/format";
import type { NearbyProvider } from "../requests.types";
import { providerNoun } from "../stages";
import { useNearbyProviders } from "../useNearbyProviders";
import { CancelRequest, type StageProps } from "./shared";

const nouns = { car_towing: "tow drivers", fuel_delivery: "fuel riders", mechanic: "mechanics" } as const;

/**
 * Provider offers (searching / no_provider). Dispatch is automatic: the backend offers the request to one
 * nearby provider at a time and the first to accept is assigned, so this shows search progress and who is nearby.
 */
export function OffersSheet({ state, request, unavailable }: StageProps & { unavailable: boolean }) {
  const d = request.dispatch;
  const near = useNearbyProviders(request.category, hasOperationalCoordinates(request.pickupLocation) ? request.pickupLocation : null, !unavailable);
  const list = near.providers ?? [];
  const who = nouns[request.category];

  return (
    <>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="title">{unavailable ? "No one accepted yet" : "Finding your provider"}</Text>
          <Text variant="bodySmall" color="muted">
            {unavailable
              ? "Every nearby provider was busy. Retry with the same pickup, or cancel and book again to change it."
              : `We offer your request to nearby ${who} one at a time. The first to accept is assigned.`}
          </Text>
        </View>
        {!unavailable ? <Badge label="Live" tone="primary" /> : null}
      </View>

      <View style={styles.stats}>
        <Stat label="Contacted" value={String(d?.attempts ?? 0)} />
        <Stat label="Radius" value={`${d?.radiusKm ?? near.radiusKm ?? "—"} km`} />
        <Stat label="Fixed fare" value={formatCurrency(request.estimate.total)} />
      </View>

      {!unavailable ? <SearchBar /> : null}

      {!unavailable ? (
        <View style={styles.list}>
          <Text variant="headline">Nearby {who}{near.providers ? ` · ${list.length}` : ""}</Text>
          {near.updatedAt ? <UpdatedAgo at={near.updatedAt} /> : null}
          {near.expanded && list.length ? (
            <Banner icon="resize-outline" title={`Nearest ${who} found within ${near.radiusKm} km`}
              message={`They are outside the ${near.dispatchRadiusKm} km auto-dispatch range, so they may not receive your request automatically. We'll keep searching.`} />
          ) : null}
          {near.loading ? <><Skeleton height={tokens.sizes.avatarLarge} radius={tokens.radius.card} /><Skeleton height={tokens.sizes.avatarLarge} radius={tokens.radius.card} /></> : null}
          {!near.loading && list.length === 0 ? (
            <Banner icon="time-outline" message={`No ${providerNoun(request.category).toLowerCase()}s online${near.radiusKm ? ` within ${near.radiusKm} km` : " nearby"} right now. We'll keep searching.`} />
          ) : null}
          {list.map((p) => <ProviderRowCard key={p.id} provider={p} />)}
        </View>
      ) : null}

      {state.error ? <Banner tone="danger" message={state.error} /> : null}
      {unavailable || !d ? <Button title="Retry search" icon="refresh" loading={state.updating} onPress={state.retrySearch} /> : null}
      <CancelRequest state={state} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="caption" color="muted">{label}</Text>
      <Text variant="headline" numberOfLines={1}>{value}</Text>
    </View>
  );
}

/** Indeterminate progress strip: an amber segment sweeping across a mist track (static when reduce motion is on). */
function SearchBar() {
  const sweep = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (!active || reduce) return;
      loop = Animated.loop(Animated.timing(sweep, {
        toValue: 1, duration: tokens.motion.pulse, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web"
      }));
      loop.start();
    });
    return () => { active = false; loop?.stop(); };
  }, [sweep]);
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.35, width] });
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Searching for a provider"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.fill, { transform: [{ translateX }] }]} />
    </View>
  );
}

function ProviderRowCard({ provider }: { provider: NearbyProvider }) {
  const jobs = `${provider.completedJobs} job${provider.completedJobs === 1 ? "" : "s"}`;
  const rating = provider.ratingCount ? `${provider.ratingAvg.toFixed(1)} (${provider.ratingCount})` : "New";
  return (
    <View style={styles.card} accessible
      accessibilityLabel={`${provider.name}, rating ${rating}, ${jobs} completed, online nearby`}>
      <Avatar name={provider.name} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>{provider.name}</Text>
        <View style={styles.meta}>
          <Icon name="star" color="amber" size={tokens.sizes.iconSmall - 2} />
          <Text variant="caption" color="muted">{rating} · {jobs}</Text>
        </View>
      </View>
      <View style={styles.online}><View style={styles.dot} /><Text variant="micro" color="green">Online</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: tokens.space.md },
  flex: { flex: 1 },
  stats: { flexDirection: "row", gap: tokens.space.sm },
  stat: { flex: 1, gap: tokens.space.xxs, padding: tokens.space.md, borderRadius: tokens.radius.control, backgroundColor: tokens.color.cloud },
  track: { height: tokens.space.xs, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.mist, overflow: "hidden" },
  fill: { width: "35%", height: "100%", borderRadius: tokens.radius.pill, backgroundColor: tokens.color.amber },
  list: { gap: tokens.space.sm },
  card: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.md, borderRadius: tokens.radius.card,
    borderWidth: tokens.sizes.hairline, borderColor: tokens.color.line, backgroundColor: tokens.color.surface
  },
  meta: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs },
  online: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs },
  dot: { width: tokens.space.sm, height: tokens.space.sm, borderRadius: tokens.space.xs, backgroundColor: tokens.color.green }
});

/** "Updated 12 s ago", re-rendered every 5 s on its own so the whole sheet does not re-render. */
function UpdatedAgo({ at }: { at: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  const label = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min`;
  return <Text variant="caption" color="muted" accessibilityLiveRegion="polite">Updated {label} ago</Text>;
}
