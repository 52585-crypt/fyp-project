import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Badge, Banner, Button, Card, Checkbox, ChipGroup, EmptyState, ErrorState, Header, HeroCard, InfoRow, Input, MapCard,
  PersonCard, PriceBreakdown, ProgressStepper, Pulse, QuantityStepper, RadioCard, RatingStars, Screen, SectionHeader,
  Select, ServiceTile, SkeletonCard, StatTile, StatusTimeline, SuccessHero, Text, TextArea
} from "../../src/design/components";
import { tokens } from "../../src/design/tokens";

const swatches = ["primary", "primaryDark", "primarySoft", "bg", "surface", "border", "text", "muted", "success", "warning", "danger"] as const;

/** Developer gallery of every design-kit component. Reachable at /kit in __DEV__ only. */
export default function KitGallery() {
  const [problem, setProblem] = useState<string | null>("accident");
  const [vehicle, setVehicle] = useState<string | null>("car");
  const [pay, setPay] = useState<"cash" | "online">("cash");
  const [rating, setRating] = useState(4);
  const [qty, setQty] = useState(5);
  const [checked, setChecked] = useState(true);
  const [note, setNote] = useState("");

  return (
    <Screen header={<Header title="Design kit" />}>
      <SectionHeader title="Colours" />
      <View style={styles.swatches}>
        {swatches.map((name) => (
          <View key={name} style={styles.swatchItem}>
            <View style={[styles.swatch, { backgroundColor: tokens.color[name] }]} />
            <Text variant="micro" color="muted">{name}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Typography" />
      <Card>
        <Text variant="display">Display 26</Text>
        <Text variant="title">Title 20</Text>
        <Text variant="headline">Headline 17</Text>
        <Text variant="body">Body 15 — Inter regular</Text>
        <Text variant="bodySmall" color="muted">Body small 13 muted</Text>
        <Text variant="caption" color="muted">Caption 12</Text>
      </Card>

      <SectionHeader title="Hero cards" />
      <HeroCard title="Need help for your vehicle?" subtitle="24/7 support • Fast • Reliable" art="car-sport" actionLabel="Get Help Now" />
      <PersonCard variant="hero" name="Rashid Khan" rating={4.8} subtitle="Tow Truck • Toyota" plate="LES 4567" />

      <SectionHeader title="Buttons" />
      <Button title="Confirm Request" />
      <Button title="Cancel Request" variant="danger" />
      <Button title="Track Driver" variant="outline" icon="navigate" />
      <Button title="Loading" loading />
      <View style={styles.row}>
        <Button title="Small" size="small" fullWidth={false} />
        <Button title="Secondary" size="small" variant="secondary" fullWidth={false} />
        <Badge label="New" />
        <Badge label="LES 4567" tone="neutral" />
      </View>

      <SectionHeader title="Inputs" />
      <Input label="Vehicle model" placeholder="Honda City" icon="car-outline" />
      <Input label="Phone" error="Enter a valid phone number" value="03" />
      <Select label="Vehicle type" value={vehicle} onChange={setVehicle} options={[
        { value: "car", label: "Car", icon: "car-outline" }, { value: "bike", label: "Bike", icon: "bicycle-outline" }
      ]} />
      <TextArea label="Additional note" optional placeholder="e.g. Car making strange noise" maxLength={200} value={note} onChangeText={setNote} />
      <ChipGroup columns={2} value={problem} onChange={setProblem} options={[
        { value: "accident", label: "Accident" }, { value: "engine", label: "Engine not starting" },
        { value: "tyre", label: "Flat Tyre" }, { value: "battery", label: "Battery Dead" }
      ]} />
      <Checkbox label="Engine is OFF" checked={checked} onChange={setChecked} />
      <QuantityStepper label="Fuel quantity" unit="Ltr" value={qty} onChange={setQty} />
      <RadioCard title="Cash" subtitle="Pay to driver" selected={pay === "cash"} onPress={() => setPay("cash")} />
      <RadioCard title="Online Payment" subtitle="Card / wallet" tag="Coming soon" selected={pay === "online"} disabled />

      <SectionHeader title="Tiles" />
      <View style={styles.grid}>
        <ServiceTile title="Tow Truck" subtitle="Vehicle towing" icon="car-sport-outline" />
        <ServiceTile title="Fuel Delivery" subtitle="At your location" icon="water-outline" selected />
        <ServiceTile title="Battery Jump" icon="battery-charging-outline" comingSoon />
      </View>
      <View style={styles.row}>
        <StatTile label="ETA" value="12 min" />
        <StatTile label="Distance" value="3.2 km" />
      </View>
      <StatTile icon="cash-outline" label="Earnings" value="Rs. 7,450" caption="Today" />

      <SectionHeader title="Summaries" />
      <Card>
        <InfoRow icon="car-outline" label="Vehicle" value="Honda City 2018" />
        <InfoRow icon="location-outline" label="Location" value="Gulberg 3, Lahore" />
        <PriceBreakdown title="Bill Summary" totalLabel="Total Estimate" total={1649}
          lines={[{ label: "Visit Fee", amount: 149 }, { label: "Towing Base Fee", amount: 1200 }, { label: "Distance Charge", amount: 300 }]}
          note="Final fare may change if extra service is required." />
      </Card>
      <Card>
        <StatusTimeline items={[
          { key: "a", label: "Driver Assigned", time: "12:30 PM", state: "done" },
          { key: "b", label: "Driver on the way", time: "12:34 PM", state: "current" },
          { key: "c", label: "Reached Destination", state: "todo" }
        ]} />
      </Card>
      <Card><ProgressStepper steps={["Accepted", "On The Way", "Arrived", "Completed"]} current={1} /></Card>
      <Card><PersonCard name="Ahmad Raza" subtitle="Expert Mechanic" rating={4.8} ratingCount={36} onCall={() => {}} onChat={() => {}} /></Card>

      <SectionHeader title="Feedback" />
      <Banner title="Your driver is on the way" message="We will notify you when the driver arrives." />
      <Banner tone="warning" title="Verification pending" message="You can go online once approved." />
      <Banner tone="danger" message="Payment failed. Try again." />
      <MapCard badge="12 min away" />
      <Pulse icon="car-sport" />
      <RatingStars value={rating} onChange={setRating} />
      <SuccessHero title="Thank you!" message="Your fuel has been delivered successfully." />
      <SuccessHero variant="hero" title="Job Completed Successfully!" amountLabel="Your payout" amount="Rs. 5,800" footnote="Credited to your wallet" />
      <SkeletonCard />
      <EmptyState title="No requests yet" message="Your service requests will appear here." actionLabel="Book a service" />
      <ErrorState onRetry={() => {}} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.md },
  swatchItem: { alignItems: "center", gap: tokens.space.xs },
  swatch: {
    width: tokens.sizes.iconTile, height: tokens.sizes.iconTile, borderRadius: tokens.radius.sm,
    borderWidth: tokens.sizes.hairline, borderColor: tokens.color.border
  },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm, flexWrap: "wrap" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm }
});
