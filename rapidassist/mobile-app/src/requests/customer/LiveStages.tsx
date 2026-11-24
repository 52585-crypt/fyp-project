import { StyleSheet, View } from "react-native";
import { Banner, Button, StatTile, SuccessHero } from "../../design/components";
import { tokens } from "../../design/tokens";
import { clockIn } from "../../utils/format";
import { providerNoun } from "../stages";
import { CancelRequest, LiveMap, ProviderRow, QuickActions, TripStatus, type StageProps } from "./shared";

function Tiles({ state }: StageProps) {
  const minutes = Number.parseInt(state.eta.replace(/\D+/g, ""), 10);
  return (
    <View style={styles.tiles}>
      <StatTile label="ETA" value={state.eta} />
      <StatTile label="Distance" value={state.distance} />
      <StatTile label="Arriving in" value={Number.isFinite(minutes) ? clockIn(minutes) : "—"} />
    </View>
  );
}

export function AssignedStage(props: StageProps) {
  const who = providerNoun(props.request.category);
  return (
    <>
      <ProviderRow {...props} variant="hero" />
      <Tiles {...props} />
      <QuickActions request={props.request} />
      <Banner title={`Your ${who.toLowerCase()} is getting ready`} message={`We'll notify you when your ${who.toLowerCase()} is on the way.`} />
      <LiveMap {...props} />
      <CancelRequest state={props.state} />
    </>
  );
}

export function TrackingStage(props: StageProps) {
  return (
    <>
      <LiveMap {...props} height={tokens.sizes.mapLarge} />
      <ProviderRow {...props} />
      <Tiles {...props} />
      <TripStatus request={props.request} />
      {props.state.locationRefreshError ? (
        <Banner tone="warning" title="GPS unavailable" message={props.state.locationRefreshError}
          action={<Button title="Retry location" size="small" variant="secondary" fullWidth={false} onPress={props.state.retryLocationRefresh} />} />
      ) : null}
      <CancelRequest state={props.state} />
    </>
  );
}

export function ArrivedStage(props: StageProps) {
  const { request } = props;
  const who = providerNoun(request.category);
  const next = request.category === "mechanic" ? "They'll start inspecting your vehicle shortly."
    : request.category === "fuel_delivery" ? "They'll start dispensing fuel shortly."
    : "They'll inspect and load your vehicle shortly.";
  return (
    <>
      <SuccessHero title={`${who} has arrived!`} message={`${request.provider?.name ?? `Your ${who.toLowerCase()}`} has reached your location. ${next}`} />
      <ProviderRow {...props} />
      <TripStatus request={request} />
      <Banner message="Need help? Use chat or call. In an emergency, tap SOS." />
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: tokens.space.sm, paddingVertical: tokens.space.md },
  tiles: { flexDirection: "row", gap: tokens.space.sm }
});
