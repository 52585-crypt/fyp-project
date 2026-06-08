import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { createRequest } from "../../../src/requests/requests.api";
import type { FuelType, MechanicIssueCategory, RequestCategory } from "../../../src/requests/requests.types";
import { AppShell, BottomNav, Card, Field, IconBox, PrimaryButton, SectionTitle, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const services: Array<{ label: string; value: RequestCategory; icon: "car" | "water" | "construct" }> = [
  { label: "Car Towing", value: "car_towing", icon: "car" },
  { label: "Fuel Delivery", value: "fuel_delivery", icon: "water" },
  { label: "Mechanic", value: "mechanic", icon: "construct" }
];

function normalizeCategoryParam(value: unknown): RequestCategory {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "fuel_delivery" || raw === "mechanic" || raw === "car_towing") return raw;
  return "car_towing";
}

const mechanicIssues: Array<{ label: string; value: MechanicIssueCategory }> = [
  { label: "Battery", value: "battery" },
  { label: "Engine", value: "engine" },
  { label: "Tyre", value: "tyre" },
  { label: "Brake", value: "brake" },
  { label: "Overheating", value: "overheating" },
  { label: "Inspection", value: "general_inspection" }
];

function estimate(category: RequestCategory, liters: number) {
  if (category === "car_towing") return { total: 2890, text: "Base towing fee, estimated distance, and service fee." };
  if (category === "fuel_delivery") return { total: liters * 275 + 600, text: "Fuel amount, delivery fee, and service fee." };
  return { total: 1250, text: "Inspection fee and visit fee. Extra work needs approval." };
}

export default function UserRequest() {
  const { token } = useAuth();
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState<RequestCategory>(() => normalizeCategoryParam(params.category));
  const [pickup, setPickup] = useState("Gulberg 3, Lahore");
  const [destination, setDestination] = useState("Johar Town, Lahore");
  const [vehicle, setVehicle] = useState("Honda Civic");
  const [registrationNumber, setRegistrationNumber] = useState("LEA 2244");
  const [fuelType, setFuelType] = useState<FuelType>("petrol");
  const [liters, setLiters] = useState("5");
  const [mechanicIssue, setMechanicIssue] = useState<MechanicIssueCategory>("battery");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const litersNumber = Math.max(1, Number(liters) || 1);
  const currentEstimate = useMemo(() => estimate(category, litersNumber), [category, litersNumber]);

  useEffect(() => {
    setCategory(normalizeCategoryParam(params.category));
  }, [params.category]);

  async function onSubmit() {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      await createRequest(token, {
        category,
        vehicleInfo: {
          type: "car",
          model: vehicle,
          registrationNumber
        },
        pickupLocation: {
          lat: 31.5204,
          lng: 74.3587,
          addressText: pickup
        },
        destinationLocation:
          category === "car_towing"
            ? {
                lat: 31.4697,
                lng: 74.2728,
                addressText: destination
              }
            : null,
        issueType: category === "mechanic" ? mechanicIssue : null,
        description,
        fuelDetails:
          category === "fuel_delivery"
            ? {
                fuelType,
                liters: litersNumber
              }
            : undefined,
        mechanicDetails:
          category === "mechanic"
            ? {
                issueCategory: mechanicIssue
              }
            : undefined
      });
      router.push("/(user)/tracking");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to create request");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Create Request" subtitle="Choose one of the three RapidAssist services.">
        <SectionTitle title="Select service" />
        <View style={styles.serviceGrid}>
          {services.map((item) => {
            const active = category === item.value;
            return (
              <Pressable key={item.value} onPress={() => setCategory(item.value)} style={[styles.service, active ? styles.serviceActive : null]}>
                <IconBox icon={item.icon} tone={active ? "primary" : "dark"} />
                <Text style={[styles.serviceText, active ? styles.serviceTextActive : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle title="Vehicle and pickup" />
        <Card style={styles.form}>
          <Field label="Pickup location" icon="locate" value={pickup} onChangeText={setPickup} />
          <Field label="Vehicle model" icon="car" value={vehicle} onChangeText={setVehicle} />
          <Field label="Registration number" icon="reader" value={registrationNumber} onChangeText={setRegistrationNumber} />
        </Card>

        {category === "car_towing" ? (
          <>
            <SectionTitle title="Towing details" />
            <Card style={styles.form}>
              <Field label="Destination" icon="flag" value={destination} onChangeText={setDestination} />
              <Field label="Breakdown reason" icon="alert-circle" placeholder="Accident, breakdown, stuck..." value={description} onChangeText={setDescription} />
            </Card>
          </>
        ) : null}

        {category === "fuel_delivery" ? (
          <>
            <SectionTitle title="Fuel details" />
            <Card style={styles.form}>
              <View style={styles.segment}>
                {(["petrol", "diesel"] as FuelType[]).map((item) => (
                  <Pressable key={item} onPress={() => setFuelType(item)} style={[styles.segmentItem, fuelType === item ? styles.segmentItemActive : null]}>
                    <Text style={[styles.segmentText, fuelType === item ? styles.segmentTextActive : null]}>{item.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Quantity in liters" icon="water" keyboardType="numeric" value={liters} onChangeText={setLiters} />
              <Field label="Notes" icon="alert-circle" placeholder="Car is parked near main gate..." value={description} onChangeText={setDescription} />
            </Card>
          </>
        ) : null}

        {category === "mechanic" ? (
          <>
            <SectionTitle title="Mechanic issue" />
            <View style={styles.issueGrid}>
              {mechanicIssues.map((item) => {
                const active = mechanicIssue === item.value;
                return (
                  <Pressable key={item.value} onPress={() => setMechanicIssue(item.value)} style={[styles.issue, active ? styles.issueActive : null]}>
                    <Text style={[styles.issueText, active ? styles.issueTextActive : null]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Card style={styles.form}>
              <Field label="Issue description" icon="construct" placeholder="Describe what happened" value={description} onChangeText={setDescription} />
            </Card>
          </>
        ) : null}

        <SectionTitle title="Estimate" />
        <Card style={styles.estimate}>
          <View style={styles.estimateRow}>
            <IconBox icon="receipt" />
            <View style={{ flex: 1 }}>
              <Text style={styles.estimateTitle}>PKR {currentEstimate.total.toLocaleString()}</Text>
              <Text style={styles.estimateText}>{currentEstimate.text}</Text>
            </View>
            <StatusPill label="Cash" tone="warning" />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton title={loading ? "Creating..." : "Confirm and Find Provider"} icon="search" disabled={loading} onPress={onSubmit} />
        </Card>
      </AppShell>
      <BottomNav role="user" active="Request" />
    </View>
  );
}

const styles = StyleSheet.create({
  serviceGrid: { flexDirection: "row", gap: 10 },
  service: { flex: 1, minHeight: 112, borderRadius: 18, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, alignItems: "center", justifyContent: "center", gap: 10, padding: 8 },
  serviceActive: { borderColor: ui.colors.primary, backgroundColor: ui.colors.primarySoft },
  serviceText: { color: ui.colors.text, fontSize: 12, fontWeight: "900", textAlign: "center" },
  serviceTextActive: { color: ui.colors.primaryDark },
  form: { gap: 12 },
  segment: { height: 48, borderRadius: 14, backgroundColor: ui.colors.bg, borderWidth: 1, borderColor: ui.colors.border, flexDirection: "row", padding: 4 },
  segmentItem: { flex: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  segmentItemActive: { backgroundColor: ui.colors.primary },
  segmentText: { color: ui.colors.muted, fontSize: 12, fontWeight: "900" },
  segmentTextActive: { color: "white" },
  issueGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  issue: { width: "31.8%", height: 46, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, alignItems: "center", justifyContent: "center" },
  issueActive: { backgroundColor: ui.colors.primary, borderColor: ui.colors.primary },
  issueText: { color: ui.colors.text, fontSize: 11, fontWeight: "900" },
  issueTextActive: { color: "white" },
  estimate: { gap: 14 },
  estimateRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  estimateTitle: { color: ui.colors.text, fontSize: 19, fontWeight: "900" },
  estimateText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});
