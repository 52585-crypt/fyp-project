import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, InfoRow, Input, MapCard, PersonCard, ProgressStepper, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { providerRoutes } from "../../navigation/routes";
import { requiresGoogleMap } from "../../services/locationMapPolicy";
import { getServiceTitle } from "../serviceCatalog";
import { providerProgress } from "../stages";
import type { ServiceRequest } from "../requests.types";
import type { ProviderJobState } from "./useProviderJob";

export type JobProps = { job: ProviderJobState; request: ServiceRequest };

export function vehicleText(r: ServiceRequest) {
  return [r.vehicleInfo.make, r.vehicleInfo.model].filter(Boolean).join(" ") || r.vehicleInfo.type || "Vehicle";
}

/** Customer identity (the API exposes no customer name/phone to providers, so chat is the contact channel). */
export function CustomerRow({ request }: { request: ServiceRequest }) {
  return (
    <Card>
      <PersonCard name="Customer" subtitle={`${vehicleText(request)}${request.vehicleInfo.registrationNumber ? ` • ${request.vehicleInfo.registrationNumber}` : ""}`}
        onChat={() => router.push(providerRoutes.chat(request.id))} />
    </Card>
  );
}

export function JobSummary({ request }: { request: ServiceRequest }) {
  const fuel = request.fuelDetails;
  return (
    <Card>
      {request.description ? (
        <>
          <Text variant="bodySmallStrong">Issue Summary</Text>
          <Text variant="bodySmall" color="muted">{request.description}</Text>
        </>
      ) : null}
      <InfoRow icon="construct-outline" label="Service" value={getServiceTitle(request.category)} />
      <InfoRow icon="car-outline" label="Vehicle" value={vehicleText(request)} />
      {request.vehicleInfo.registrationNumber ? <InfoRow icon="pricetag-outline" label="Plate Number" value={request.vehicleInfo.registrationNumber} /> : null}
      {fuel?.liters ? <InfoRow icon="water-outline" label="Fuel" value={`${fuel.fuelType === "diesel" ? "Diesel" : "Petrol"} • ${fuel.liters} Ltr`} /> : null}
      {request.issueType && request.category !== "fuel_delivery" ? <InfoRow icon="alert-circle-outline" label="Problem" value={request.issueType.replaceAll("_", " ")} /> : null}
      <InfoRow icon="location-outline" label="Pickup" value={request.pickupLocation.addressText ?? "Pinned location"} stacked />
      {request.destinationLocation?.addressText ? <InfoRow icon="flag-outline" label="Drop-off" value={request.destinationLocation.addressText} stacked /> : null}
    </Card>
  );
}

export function JobMap({ job, request, height }: JobProps & { height?: number }) {
  const centre = job.from ?? job.to;
  const approx = job.route.approximate ? "~" : "";
  const badge = job.route.minutes ? `${approx}${job.route.minutes} min${job.route.km ? ` • ${approx}${job.route.km.toFixed(1)} km` : ""}` : null;
  return (
    <MapCard height={height} badge={badge} pickup={centre ?? undefined} destination={job.from ? job.to : null} route={job.route.coords}
      pickupLabel={job.from ? "You" : "Customer"} destinationLabel={job.toDestination ? "Drop-off" : "Customer"}
      requiresGoogleMap={requiresGoogleMap(request.pickupLocation, request.destinationLocation)} interactive />
  );
}

export function JobProgress({ request }: { request: ServiceRequest }) {
  const p = providerProgress(request);
  return (
    <Card>
      <Text variant="bodySmallStrong">Job Progress</Text>
      <ProgressStepper steps={p.steps} current={p.current} />
    </Card>
  );
}

export function CancelJob({ job }: { job: ProviderJobState }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <Button title="Cancel Job" variant="danger" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Text variant="headline">Cancel this job?</Text>
      <Text variant="bodySmall" color="muted">The customer will be notified and the request closed.</Text>
      <Input label="Reason" optional value={reason} onChangeText={setReason} placeholder="e.g. Vehicle breakdown" />
      <View style={styles.row}>
        <Button title="Keep job" variant="outline" fullWidth={false} style={styles.flex} onPress={() => setOpen(false)} />
        <Button title="Cancel job" variant="danger" fullWidth={false} style={styles.flex} loading={job.updating}
          onPress={async () => { if (await job.cancel(reason)) setOpen(false); }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", gap: tokens.space.md }, flex: { flex: 1 } });
