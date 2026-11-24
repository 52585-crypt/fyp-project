import { StyleSheet, View } from "react-native";
import { Avatar, Banner, Button, Icon, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { clockIn } from "../../utils/format";
import { getServiceTitle } from "../serviceCatalog";
import { customerCanCancel, providerNoun, type CustomerStage } from "../stages";
import { ArrivalPinCard } from "./ArrivalPinCard";
import { CancelRequest, QuickActions, TripStatus, type StageProps } from "./shared";

/** Live tracking sheet for assigned / tracking / arrived: ETA, provider, arrival PIN, actions, trip status. */
export function TrackingSheet({ stage, state, request }: StageProps & { stage: CustomerStage }) {
  const who = providerNoun(request.category).toLowerCase();
  const name = request.provider?.name?.split(/\s+/)[0] ?? `Your ${who}`;
  const arrived = stage === "arrived";
  const minutes = Number.parseInt(state.eta.replace(/\D+/g, ""), 10);
  const headline = arrived ? `${name} has arrived` : stage === "assigned" ? `${name} is getting ready` : `${name} is on the way`;
  const sub = arrived
    ? request.category === "mechanic" ? "They'll inspect your vehicle shortly." : request.category === "fuel_delivery" ? "They'll start dispensing fuel shortly." : "They'll inspect and load your vehicle shortly."
    : stage === "assigned" ? `We'll let you know when your ${who} sets off.`
    : Number.isFinite(minutes) ? `Arriving around ${clockIn(minutes)}`
    : state.route.stale ? "Their live location is delayed. Showing the last known spot." : "Working out the arrival time…";

  return (
    <>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="title" accessibilityLiveRegion="polite">{headline}</Text>
          <Text variant="bodySmall" color="muted">{sub}</Text>
        </View>
        {!arrived ? (
          <View style={styles.eta} accessible accessibilityLabel={`ETA ${state.eta}, distance ${state.distance}`}>
            {Number.isFinite(minutes) ? (
              <>
                <Text variant="figure" color="onPrimary">{minutes}</Text>
                <Text variant="micro" color="onPrimaryMuted">MIN</Text>
              </>
            ) : <Icon name="time-outline" color="onPrimary" size={tokens.sizes.iconLarge} />}
          </View>
        ) : (
          <View style={[styles.eta, styles.etaArrived]}><Icon name="checkmark" color="onPrimary" size={tokens.sizes.iconLarge} /></View>
        )}
      </View>

      {request.provider ? (
        <View style={styles.provider}>
          <Avatar name={request.provider.name} size={tokens.sizes.avatarLarge} />
          <View style={styles.flex}>
            <Text variant="headline" numberOfLines={1}>{request.provider.name}</Text>
            <View style={styles.meta}>
              <Icon name="star" color="amber" size={tokens.sizes.iconSmall - 2} />
              <Text variant="caption" color="muted">
                {request.provider.ratingCount ? `${request.provider.ratingAvg.toFixed(1)} (${request.provider.ratingCount})` : "New"} · {getServiceTitle(request.category)}
              </Text>
            </View>
          </View>
          {!arrived && state.distance !== "—" ? <Text variant="captionStrong" color="muted">{state.distance}</Text> : null}
        </View>
      ) : null}

      <ArrivalPinCard providerName={request.provider?.name} arrived={arrived} />
      <QuickActions request={request} />

      {state.locationRefreshError ? (
        <Banner tone="warning" title="GPS unavailable" message={state.locationRefreshError}
          action={<Button title="Retry location" size="small" variant="secondary" fullWidth={false} onPress={state.retryLocationRefresh} />} />
      ) : null}
      {state.error ? <Banner tone="danger" message={state.error} /> : null}
      <TripStatus request={request} />
      {arrived ? <Banner message="Need help? Use chat or call. In an emergency, tap SOS." /> : null}
      {customerCanCancel(stage) ? <CancelRequest state={state} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  flex: { flex: 1 },
  eta: {
    minWidth: tokens.sizes.avatarLarge + tokens.space.sm, minHeight: tokens.sizes.avatarLarge, paddingVertical: tokens.space.sm, paddingHorizontal: tokens.space.md,
    alignItems: "center", justifyContent: "center", borderRadius: tokens.radius.card, backgroundColor: tokens.color.indigo
  },
  etaArrived: { backgroundColor: tokens.color.green },
  provider: {
    flexDirection: "row", alignItems: "center", gap: tokens.space.md, padding: tokens.space.md,
    borderRadius: tokens.radius.card, backgroundColor: tokens.color.cloud
  },
  meta: { flexDirection: "row", alignItems: "center", gap: tokens.space.xs }
});
