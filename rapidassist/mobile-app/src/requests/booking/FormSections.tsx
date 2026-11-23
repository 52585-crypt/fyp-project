import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, Card, ChipGroup, HeroCard, Input, Select, ServiceTile, Text, TextArea } from "../../design/components";
import { tokens } from "../../design/tokens";
import { customerRoutes } from "../../navigation/routes";
import { fuelQuantities, fuelTypes, mechanicServices, towingProblems, vehicleTypes } from "./options";
import type { BookingState } from "./useBookingState";

const MANUAL = "__manual__";

export function VehicleSection({ b, compact }: { b: BookingState; compact?: boolean }) {
  const options = [
    ...b.vehicles.map((v) => ({ value: v.id, label: [`${v.make} ${v.model}`.trim(), v.registrationNumber].filter(Boolean).join(" · "), icon: "car-outline" as const })),
    { value: MANUAL, label: "Enter manually", icon: "create-outline" as const }
  ];
  return (
    <Card>
      <Text variant="bodyStrong">Vehicle Details</Text>
      {b.vehicles.length ? (
        <Select label="Vehicle" value={b.vehicleId ?? MANUAL} options={options} onChange={(v) => b.chooseVehicle(v === MANUAL ? null : v)} />
      ) : null}
      {!b.selectedVehicle ? (
        <>
          {!compact ? <Select label="Vehicle Type" value={b.vehicleType} onChange={b.setVehicleType} options={vehicleTypes} /> : null}
          <Input label="Vehicle Model" placeholder="e.g. Honda City" value={b.vehicleModel} onChangeText={b.setVehicleModel} />
          <Input label="Vehicle Number" optional placeholder="e.g. LEA 1234" autoCapitalize="characters" value={b.plate} onChangeText={b.setPlate} />
        </>
      ) : null}
      <Button title="Add a saved vehicle" icon="add" variant="ghost" size="small" onPress={() => router.push(customerRoutes.addVehicle)} />
    </Card>
  );
}

export function TowingFields({ b }: { b: BookingState }) {
  return (
    <View style={styles.gap}>
      <Text variant="bodySmallStrong">Why do you need towing?</Text>
      <ChipGroup columns={2} options={towingProblems} value={b.problem} onChange={b.setProblem} accessibilityLabel="Problem type" />
    </View>
  );
}

export function FuelFields({ b }: { b: BookingState }) {
  return (
    <>
      <View style={styles.gap}>
        <Text variant="bodySmallStrong">Select Fuel Type</Text>
        <ChipGroup columns={2} options={fuelTypes} value={b.fuelType} onChange={b.setFuelType} accessibilityLabel="Fuel type" />
      </View>
      <View style={styles.gap}>
        <Text variant="bodySmallStrong">Select Vehicle Type</Text>
        <ChipGroup columns={2} options={vehicleTypes} value={b.vehicleType} onChange={b.setVehicleType} accessibilityLabel="Vehicle type" />
      </View>
      <View style={styles.gap}>
        <Text variant="bodySmallStrong">Select Quantity</Text>
        <ChipGroup options={fuelQuantities} value={b.liters} onChange={b.setLiters} accessibilityLabel="Fuel quantity" />
      </View>
    </>
  );
}

export function MechanicFields({ b }: { b: BookingState }) {
  return (
    <>
      <HeroCard title="What do you need help with?" subtitle="Select a service" art="construct" />
      <View style={styles.grid}>
        {mechanicServices.map((s) => (
          <ServiceTile key={s.value} title={s.label} subtitle={s.subtitle} icon={s.icon}
            selected={b.mechanicIssue === s.value} onPress={() => b.setMechanicIssue(s.value)} />
        ))}
      </View>
    </>
  );
}

export function NotesField({ b }: { b: BookingState }) {
  const fuel = b.category === "fuel_delivery";
  return (
    <TextArea label={fuel ? "Add Delivery Instructions" : b.category === "mechanic" ? "Problem Description" : "Additional Note"} optional
      placeholder={fuel ? "e.g. Near main gate, call me on arrival" : "e.g. Car does not start and battery light is on"}
      maxLength={200} value={b.description} onChangeText={b.setDescription} />
  );
}

const styles = StyleSheet.create({
  gap: { gap: tokens.space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm }
});
