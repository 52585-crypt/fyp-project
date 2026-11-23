import { router } from "expo-router";
import { useState } from "react";
import { Banner, Button, Card, InfoRow, PriceBreakdown, SuccessHero } from "../../design/components";
import { customerRoutes } from "../../navigation/routes";
import { providerNoun } from "../stages";
import { LiveMap, ProviderRow, TripStatus, type StageProps } from "./shared";

export function VehiclePickedUpStage(props: StageProps) {
  const [showMap, setShowMap] = useState(false);
  const { request, state } = props;
  return (
    <>
      <SuccessHero tone="primary" icon="car-sport" title="Vehicle Picked Up" message="Your vehicle is on the way to the destination." />
      <Card>
        <InfoRow icon="flag-outline" label="Destination" value={request.destinationLocation?.addressText ?? "Drop-off location"} stacked />
        <InfoRow icon="time-outline" label="ETA" value={state.eta} />
      </Card>
      {showMap ? <LiveMap {...props} /> : <Button title="View Live Tracking" icon="navigate" onPress={() => setShowMap(true)} />}
      <ProviderRow {...props} />
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

