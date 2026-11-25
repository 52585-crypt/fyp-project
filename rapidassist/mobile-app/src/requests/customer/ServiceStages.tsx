import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Card, InfoRow, PriceBreakdown, StatTile, SuccessHero, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { customerRoutes } from "../../navigation/routes";
import { providerNoun } from "../stages";
import { ProviderRow, TripStatus, type StageProps } from "./shared";

/** Towing after loading: shown over the live map (planned trip dotted, remaining route live). */
export function VehiclePickedUpStage(props: StageProps) {
  const { request, state } = props;
  const total = state.towTrip.km;
  return (
    <>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="title" accessibilityLiveRegion="polite">Your vehicle is on the way</Text>
          <Text variant="bodySmall" color="muted" numberOfLines={2}>To {request.destinationLocation?.addressText ?? "the drop-off location"}</Text>
        </View>
      </View>
      <View style={styles.stats}>
        <StatTile label="Remaining" value={state.distance} />
        <StatTile label="ETA" value={state.eta} />
        {total != null ? <StatTile label="Whole trip" value={`${total.toFixed(1)} km`} /> : null}
      </View>
      {state.route.stale ? <Banner tone="warning" message="The driver's live location is delayed. Showing the last known spot." /> : null}
      <ProviderRow {...props} />
      <TripStatus request={request} />
    </>
  );
}

export function ReachedDestinationStage(props: StageProps) {
  return (
    <>
      <SuccessHero tone="primary" icon="location" title="Reached Destination" message="Your vehicle has reached the destination." />
      <Banner message="The driver is finishing up. You'll be asked to confirm completion next." />
      <ProviderRow {...props} />
      <TripStatus request={props.request} />
    </>
  );
}

export function FuelDeliveredStage(props: StageProps) {
  const fuel = props.request.fuelDetails;
  return (
    <>
      <SuccessHero tone="primary" icon="water" title="Fuel delivered" message="The rider has dispensed your fuel. Please check before confirming." />
      <Card>
        <InfoRow icon="water-outline" label="Fuel type" value={fuel?.fuelType ? fuel.fuelType[0]!.toUpperCase() + fuel.fuelType.slice(1) : null} />
        <InfoRow icon="speedometer-outline" label="Quantity" value={fuel?.liters ? `${fuel.liters} Ltr` : null} />
      </Card>
      <Banner message="The rider will mark the delivery complete, then you'll confirm it here." />
      <ProviderRow {...props} />
    </>
  );
}

export function InProgressStage(props: StageProps) {
  const { request } = props;
  return (
    <>
      <SuccessHero tone="primary" icon="construct" title={request.category === "mechanic" ? "Work in progress" : "Service in progress"}
        message={request.status === "inspection_started" ? "Your mechanic is inspecting the vehicle." : `Your ${providerNoun(request.category).toLowerCase()} is working on it.`} />
      <ProviderRow {...props} />
      <TripStatus request={request} />
      <Card>
        <PriceBreakdown title="Current estimate" lines={request.estimate.lines} total={request.estimate.total}
          note="Extra work is only added after your approval." />
      </Card>
    </>
  );
}

const completionCopy = {
  car_towing: { title: "Reached Destination", body: "Please verify your vehicle and confirm to complete the service." },
  fuel_delivery: { title: "Confirm fuel delivered", body: "Please check the delivered fuel before confirming." },
  mechanic: { title: "Service finished", body: "Your mechanic has finished. Check the repair, then confirm." }
} as const;

export function ConfirmCompletionStage(props: StageProps) {
  const { request, state } = props;
  const copy = completionCopy[request.category];
  return (
    <>
      <SuccessHero tone="primary" icon="checkmark-done" title={copy.title} message={copy.body} />
      {request.category === "fuel_delivery" && request.fuelDetails?.liters ? (
        <Card><InfoRow icon="water-outline" label="Delivered quantity" value={`${request.fuelDetails.liters} Ltr`} strong /></Card>
      ) : null}
      <Card>
        <PriceBreakdown title="Bill summary" lines={request.estimate.lines} total={request.estimate.total} totalLabel="Total Amount" />
      </Card>
      <Button title="Confirm Completion" icon="checkmark-circle" loading={state.updating} onPress={state.confirmCompletion} />
      <Button title="Report an Issue" variant="outline" onPress={() => router.push(customerRoutes.support)} />
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  flex: { flex: 1 },
  stats: { flexDirection: "row", gap: tokens.space.sm }
});
