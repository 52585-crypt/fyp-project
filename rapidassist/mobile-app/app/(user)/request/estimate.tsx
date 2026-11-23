import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Card, ChipGroup, Header, InfoRow, MapCard, PriceBreakdown, Screen, Text } from "../../../src/design/components";
import { tokens } from "../../../src/design/tokens";
import { useBooking } from "../../../src/requests/booking/BookingProvider";
import { bookingCopy } from "../../../src/requests/booking/options";
import type { RequestPriority } from "../../../src/requests/requests.types";
import { getServiceTitle } from "../../../src/requests/serviceCatalog";
import { requiresGoogleMap } from "../../../src/services/locationMapPolicy";

const priorities: ReadonlyArray<{ value: RequestPriority; label: string }> = [
  { value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }
];

/** Price estimate + confirm. Creating the request happens here. */
export default function Estimate() {
  const b = useBooking();
  const copy = bookingCopy[b.category];
  const route = b.route.route;
  useEffect(() => { if (!b.pickup) router.back(); }, [b.pickup]);
  if (!b.pickup) return null;

  const badge = route ? `${route.distanceKm.toFixed(1)} km • ${route.durationMinutes} min` : null;
  const vehicle = b.selectedVehicle ? `${b.selectedVehicle.make} ${b.selectedVehicle.model}`.trim() : [b.vehicleModel, b.plate].filter(Boolean).join(" · ");

  return (
    <Screen header={<Header title={copy.estimateTitle} />}
      footer={<Button title="Confirm Request" loading={b.submitting} disabled={b.waitingForRoute || !b.estimate} onPress={b.submit} />}>
      <MapCard badge={badge} pickup={{ latitude: b.pickup.latitude, longitude: b.pickup.longitude }}
        destination={b.towing && b.destination ? { latitude: b.destination.latitude, longitude: b.destination.longitude } : null}
        route={b.towing ? route?.coordinates : undefined} pickupLabel="Pickup" destinationLabel="Drop-off"
        requiresGoogleMap={requiresGoogleMap(b.pickup, b.destination)} />
      <Card>
        <InfoRow icon="location-outline" label={b.towing ? "Pickup" : "Location"} value={b.pickup.address} stacked />
        {b.towing && b.destination ? <InfoRow icon="flag-outline" label="Drop-off" value={b.destination.address} stacked /> : null}
      </Card>
      <Card>
        <Text variant="bodyStrong">{b.category === "fuel_delivery" ? "Delivery Summary" : "Service Summary"}</Text>
        <InfoRow label="Service" value={getServiceTitle(b.category)} />
        {b.category === "fuel_delivery" ? (
          <>
            <InfoRow label="Fuel Type" value={b.fuelType === "petrol" ? "Petrol" : "Diesel"} />
            <InfoRow label="Vehicle Type" value={b.vehicleType === "bike" ? "Bike" : "Car"} />
            <InfoRow label="Quantity" value={`${b.litersNumber} Ltr`} />
          </>
        ) : <InfoRow label="Vehicle" value={vehicle || "—"} />}
      </Card>
      <Card>
        {b.estimate ? (
          <PriceBreakdown lines={b.estimate.lines} total={b.estimate.total} totalLabel="Total Estimate"
            note="Final fare may change if extra service or waiting time is required." />
        ) : (
          <Text variant="bodySmall" color="muted">{b.waitingForRoute ? "Finding the driving route…" : "Estimate unavailable."}</Text>
        )}
      </Card>
      {b.route.error ? (
        <Banner tone="warning" title="Driving route unavailable" message={b.route.error}
          action={<Button title="Retry route" size="small" variant="secondary" fullWidth={false} onPress={b.route.retry} />} />
      ) : null}
      <View style={styles.gap}>
        <Text variant="bodySmallStrong">Priority</Text>
        <ChipGroup columns={3} options={priorities} value={b.priority} onChange={b.setPriority} accessibilityLabel="Priority" />
      </View>
      {b.nearby !== null ? <Banner icon="people-outline" message={`${b.nearby} providers available nearby.`} /> : null}
      {b.error ? <Banner tone="danger" message={b.error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ gap: { gap: tokens.space.sm } });
