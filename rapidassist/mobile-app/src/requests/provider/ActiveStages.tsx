import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Banner, Button, Card, Checkbox, InfoRow, PhotoUpload, PriceBreakdown, StatTile, SuccessHero, Text } from "../../design/components";
import { tokens } from "../../design/tokens";
import { providerRoutes } from "../../navigation/routes";
import { CancelJob, CustomerRow, JobMap, JobProgress, JobSummary, type JobProps } from "./shared";

export function JobDetailsStage(props: JobProps) {
  const { job, request } = props;
  return (
    <>
      <CustomerRow request={request} />
      <JobSummary request={request} />
      <JobMap {...props} />
      <Card><PriceBreakdown title="Fee Breakdown" lines={request.estimate.lines} total={request.estimate.total} totalLabel="Estimated Total" /></Card>
      <Button title="Start Navigation" icon="navigate" loading={job.updating}
        onPress={async () => { if (await job.advance()) void job.navigate(); }} />
      <CancelJob job={job} />
    </>
  );
}

export function OnTheWayStage(props: JobProps) {
  const { job, request } = props;
  return (
    <>
      <View style={styles.eta}>
        <StatTile label="ETA" value={job.route.minutes ? `${job.route.minutes} min` : "—"} />
        <StatTile label="Distance" value={job.route.km ? `${job.route.km.toFixed(1)} km` : "—"} />
      </View>
      <JobMap {...props} height={tokens.sizes.mapLarge} />
      <CustomerRow request={request} />
      <JobProgress request={request} />
      <Button title="Open in Maps" icon="navigate-outline" variant="outline" onPress={job.navigate} />
      <Button title="I've Arrived" icon="flag" loading={job.updating} onPress={job.advance} />
      <CancelJob job={job} />
    </>
  );
}

const fuelChecks = ["Engine is OFF", "No Smoking Nearby", "Correct Fuel Type Confirmed", "No Spill / Leakage", "Customer Confirmed"];

function FuelChecklist({ job, request }: JobProps) {
  const [checked, setChecked] = useState<string[]>([]);
  const done = checked.length === fuelChecks.length;
  return (
    <>
      <Card>
        <Text variant="bodySmallStrong">Delivered Quantity</Text>
        <InfoRow icon="water-outline" label={request.fuelDetails?.fuelType === "diesel" ? "Diesel" : "Petrol"} value={`${request.fuelDetails?.liters ?? "—"} Ltr`} strong />
        <Text variant="caption" color="muted">Adjusting the delivered quantity is coming soon.</Text>
      </Card>
      <Card>
        <Text variant="bodySmallStrong">Safety Checklist</Text>
        {fuelChecks.map((c) => (
          <Checkbox key={c} label={c} checked={checked.includes(c)}
            onChange={(on) => setChecked((x) => (on ? [...x, c] : x.filter((v) => v !== c)))} />
        ))}
      </Card>
      <Card>
        <Text variant="bodySmallStrong">Photo Proof (Optional)</Text>
        <PhotoUpload title="Pump / meter photo" icon="camera-outline" optional />
        <Text variant="caption" color="muted">Photo upload is coming soon.</Text>
      </Card>
      <Button title="Confirm Delivery Details" disabled={!done} loading={job.updating} onPress={job.advance}
        accessibilityHint={done ? undefined : "Complete every safety check first"} />
    </>
  );
}

export function ArrivedStage(props: JobProps) {
  const { job, request } = props;
  const [dispensing, setDispensing] = useState(false);
  if (request.category === "fuel_delivery" && dispensing) return <FuelChecklist {...props} />;
  const copy = {
    car_towing: { title: "You have reached the pickup location", note: "Please inspect the vehicle condition and safely load the vehicle.", action: "Confirm Vehicle Pickup" },
    fuel_delivery: { title: "You have reached the customer location", note: "Please confirm safety with the customer before dispensing fuel.", action: "Start Delivery" },
    mechanic: { title: "You have reached the customer location", note: "Please confirm with the customer and start the inspection.", action: "Start Inspection" }
  }[request.category];
  return (
    <>
      <SuccessHero tone="primary" title={copy.title} />
      <CustomerRow request={request} />
      <Card><InfoRow icon="location-outline" label="Location" value={request.pickupLocation.addressText ?? "Pinned location"} stacked /></Card>
      <Banner message={copy.note} />
      <Button title={copy.action} loading={job.updating}
        onPress={() => (request.category === "fuel_delivery" ? setDispensing(true) : void job.advance())} />
      <CancelJob job={job} />
    </>
  );
}

export function InspectionStage({ job, request }: JobProps) {
  const rejected = request.mechanicDetails?.extraWork?.status === "rejected";
  return (
    <>
      <SuccessHero tone="primary" icon="search" title="Inspection in progress" message="Inspect the vehicle. If more work is needed, send it for the customer's approval." />
      {rejected ? <Banner tone="warning" title="Extra work declined" message="The customer declined the last extra-work request. Continue with the original job." /> : null}
      <CustomerRow request={request} />
      <JobProgress request={request} />
      <Button title="Request Extra Work" icon="add-circle-outline" variant="outline" onPress={() => router.push(providerRoutes.extraWork(request.id))} />
      <Button title="Start Repair" icon="construct" loading={job.updating} onPress={job.advance} />
    </>
  );
}

export function AwaitingApprovalStage({ request }: JobProps) {
  const extra = request.mechanicDetails?.extraWork;
  return (
    <>
      <SuccessHero tone="primary" icon="hourglass-outline" title="Waiting for customer approval" message="We'll update this screen as soon as the customer decides." />
      <Card>
        <PriceBreakdown title="Extra work sent" lines={[
          ...(extra?.partName || extra?.partPrice ? [{ label: extra?.partName || "Parts", amount: extra?.partPrice ?? 0 }] : []),
          ...(extra?.laborCharge ? [{ label: "Labour", amount: extra.laborCharge }] : [])
        ]} total={(extra?.partPrice ?? 0) + (extra?.laborCharge ?? 0)} totalLabel="Extra Work Total" note={extra?.description ?? undefined} />
      </Card>
      <CustomerRow request={request} />
    </>
  );
}

const styles = StyleSheet.create({ eta: { flexDirection: "row", gap: tokens.space.sm } });
