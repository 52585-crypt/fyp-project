import { router } from "expo-router";
import { useState } from "react";
import { Banner, Button, ChipGroup, Header, Input, Screen, Text } from "../../../src/design/components";
import { customerRoutes } from "../../../src/navigation/routes";
import { useVehicles } from "../../../src/vehicles/useVehicles";
import type { VehicleType } from "../../../src/vehicles/vehicles.types";

const types = [
  { value: "car", label: "Car", icon: "car-sport-outline" },
  { value: "bike", label: "Bike", icon: "bicycle-outline" },
  { value: "towing", label: "Truck", icon: "car-outline" }
] as const;

export default function AddVehicle() {
  const v = useVehicles();
  const [type, setType] = useState<VehicleType>("car");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plate, setPlate] = useState("");
  const parsedYear = Number(year);
  const yearValid = Number.isFinite(parsedYear) && parsedYear >= 1970;
  const canSubmit = make.trim().length >= 2 && model.trim().length >= 1 && yearValid;

  async function save() {
    const ok = await v.add({ type, make: make.trim(), model: model.trim(), year: parsedYear, registrationNumber: plate.trim() || null });
    if (ok) router.canGoBack() ? router.back() : router.replace(customerRoutes.vehicles);
  }

  return (
    <Screen header={<Header title="Add Vehicle" />}
      footer={<Button title="Save vehicle" loading={v.busy} disabled={!canSubmit} onPress={save} />}>
      <Text variant="bodySmallStrong">Vehicle type</Text>
      <ChipGroup columns={3} options={types} value={type} onChange={setType} accessibilityLabel="Vehicle type" />
      <Input label="Make" placeholder="e.g. Honda" value={make} onChangeText={setMake} />
      <Input label="Model" placeholder="e.g. City" value={model} onChangeText={setModel} />
      <Input label="Year" placeholder="e.g. 2018" keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear}
        error={year.length === 4 && !yearValid ? "Enter a year from 1970 onwards." : null} />
      <Input label="Registration number" optional placeholder="e.g. LEA-18-1234" autoCapitalize="characters" value={plate} onChangeText={setPlate} />
      {v.error ? <Banner tone="danger" message={v.error} /> : null}
    </Screen>
  );
}
