import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router } from "expo-router";
import { colors } from "../../../src/theme/colors";
import { RAButton } from "../../../src/components/RAButton";
import { RATextInput } from "../../../src/components/RATextInput";
import { useAuth } from "../../../src/auth/AuthProvider";
import type { Vehicle } from "../../../src/vehicles/vehicles.types";
import { listMyVehicles } from "../../../src/vehicles/vehicles.api";
import type { RequestCategory } from "../../../src/requests/requests.types";
import { createRequest } from "../../../src/requests/requests.api";

type ServiceOption = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  category: RequestCategory;
  issueType: string | null;
  unknownIssue?: boolean;
};

const serviceOptions: ServiceOption[] = [
  { id: "car_repair", title: "Car Repair", subtitle: "Engine, tyre, inspection", icon: "car-sport", category: "car", issueType: "engine" },
  { id: "bike_repair", title: "Bike Repair", subtitle: "Bike breakdown", icon: "bicycle", category: "bike", issueType: "engine" },
  { id: "fuel", title: "Fuel Delivery", subtitle: "Petrol support", icon: "water", category: "car", issueType: "fuel_delivery" },
  { id: "towing", title: "Towing", subtitle: "Move vehicle", icon: "car", category: "towing", issueType: "towing" },
  { id: "battery", title: "Battery", subtitle: "Jump start", icon: "battery-charging", category: "car", issueType: "battery" },
  { id: "unknown", title: "Unknown", subtitle: "Inspect first", icon: "help-circle", category: "car", issueType: null, unknownIssue: true }
];

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function ServiceCard({ item, selected, onPress }: { item: ServiceOption; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.serviceCard, selected ? styles.serviceCardSelected : null]}>
      <View style={styles.serviceTop}>
        <View style={[styles.serviceIcon, selected ? styles.serviceIconSelected : null]}>
          <Ionicons name={item.icon} size={19} color={selected ? "white" : colors.primaryDark} />
        </View>
        {selected ? <Ionicons name="checkmark-circle" size={19} color={colors.primaryDark} /> : null}
      </View>
      <Text style={[styles.serviceTitle, selected ? styles.serviceTitleSelected : null]}>{item.title}</Text>
      <Text style={styles.serviceSubtitle}>{item.subtitle}</Text>
    </Pressable>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function CreateRequest() {
  const { token } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState(serviceOptions[0].id);
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("31.5204");
  const [lng, setLng] = useState("74.3587");
  const [addressText, setAddressText] = useState("Gulberg, Lahore");
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedService = useMemo(
    () => serviceOptions.find((option) => option.id === selectedServiceId) || serviceOptions[0],
    [selectedServiceId]
  );

  const loadVehicles = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const data = await listMyVehicles(token);
      setVehicles(data);
      if (!vehicleId && data.length > 0) setVehicleId(data[0].id);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load vehicles");
    }
  }, [token, vehicleId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const selectedVehicle = useMemo(() => vehicles.find((vehicle) => vehicle.id === vehicleId) || null, [vehicleId, vehicles]);

  const locationReady = useMemo(() => {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    return Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
  }, [lat, lng]);

  const canSubmit = Boolean(vehicleId && locationReady && !loading);

  async function useCurrentLocation() {
    try {
      setLocationLoading(true);
      setError(null);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location permission is required to use current location.");
        return;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(String(current.coords.latitude));
      setLng(String(current.coords.longitude));

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude
        });
        if (address) {
          const readable = [address.name, address.street, address.city, address.region].filter(Boolean).join(", ");
          setAddressText(readable || "Current location");
        }
      } catch {
        setAddressText("Current location");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to fetch current location");
    } finally {
      setLocationLoading(false);
    }
  }

  async function onSubmit() {
    if (!token || !vehicleId || !locationReady) return;
    try {
      setLoading(true);
      setError(null);
      await createRequest(token, {
        vehicleId,
        category: selectedService.category,
        unknownIssue: Boolean(selectedService.unknownIssue),
        issueType: selectedService.unknownIssue ? null : selectedService.issueType,
        description: description.trim() ? description.trim() : null,
        location: {
          lat: Number(lat),
          lng: Number(lng),
          addressText: addressText.trim() ? addressText.trim() : null
        }
      });
      router.replace("/(app)/home");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Service Information</Text>
            <Text style={styles.subtitle}>Vehicle, problem, pickup details</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Section title="Our Services">
            <View style={styles.serviceGrid}>
              {serviceOptions.map((option) => (
                <ServiceCard
                  key={option.id}
                  item={option}
                  selected={option.id === selectedServiceId}
                  onPress={() => setSelectedServiceId(option.id)}
                />
              ))}
            </View>
          </Section>

          <Section
            title="Vehicle Information"
            action={
              <Pressable onPress={() => router.push("/(app)/vehicles/add")} style={styles.smallAction}>
                <Ionicons name="add" size={16} color={colors.primaryDark} />
                <Text style={styles.smallActionText}>Add</Text>
              </Pressable>
            }
          >
            {vehicles.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="car-outline" size={22} color={colors.mutedText} />
                <Text style={styles.emptyText}>Add a vehicle before sending a request.</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={vehicles}
                keyExtractor={(vehicle) => vehicle.id}
                contentContainerStyle={styles.vehicleList}
                renderItem={({ item }) => {
                  const selected = item.id === vehicleId;
                  return (
                    <Pressable onPress={() => setVehicleId(item.id)} style={[styles.vehicleCard, selected ? styles.vehicleCardSelected : null]}>
                      <View style={[styles.vehicleIcon, selected ? styles.vehicleIconSelected : null]}>
                        <Ionicons name={item.type === "bike" ? "bicycle" : "car-sport"} size={18} color={selected ? "white" : colors.primaryDark} />
                      </View>
                      <Text style={[styles.vehicleTitle, selected ? styles.vehicleTitleSelected : null]}>
                        {item.make} {item.model}
                      </Text>
                      <Text style={styles.vehicleText}>{item.type.toUpperCase()} - {item.year}</Text>
                    </Pressable>
                  );
                }}
              />
            )}
          </Section>

          <Section title="Pickup Location">
            <Pressable onPress={useCurrentLocation} disabled={locationLoading} style={styles.locationButton}>
              <Ionicons name="navigate" size={18} color={colors.primaryDark} />
              <View style={{ flex: 1 }}>
                <Text style={styles.locationTitle}>{locationLoading ? "Fetching location..." : "Use current location"}</Text>
                <Text style={styles.locationText}>{addressText || "Tap to capture current position"}</Text>
              </View>
            </Pressable>
            <View style={{ height: 10 }} />
            <RATextInput icon="location" placeholder="Address" value={addressText} onChangeText={setAddressText} />
            <View style={styles.coordinateRow}>
              <View style={{ flex: 1 }}>
                <RATextInput icon="navigate" placeholder="Lat" keyboardType="numeric" value={lat} onChangeText={setLat} />
              </View>
              <View style={{ flex: 1 }}>
                <RATextInput icon="navigate" placeholder="Lng" keyboardType="numeric" value={lng} onChangeText={setLng} />
              </View>
            </View>
          </Section>

          <Section title="Problem Details">
            <RATextInput icon="chatbox-ellipses" placeholder="Short description (optional)" value={description} onChangeText={setDescription} />
          </Section>

          <View style={styles.reviewBox}>
            <Text style={styles.reviewTitle}>Service Summary</Text>
            <SummaryLine label="Service Type" value={selectedService.title} />
            <SummaryLine label="Vehicle" value={selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : "Not selected"} />
            <SummaryLine label="Location" value={addressText || `${lat}, ${lng}`} />
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>Estimated Total</Text>
              <Text style={styles.estimateValue}>Rs. 390</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <RAButton
            title={loading ? "Sending request..." : "Confirm Request"}
            disabled={!canSubmit || vehicles.length === 0}
            onPress={onSubmit}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, padding: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  subtitle: { marginTop: 3, color: colors.mutedText, fontSize: 13, fontWeight: "700" },
  content: { paddingBottom: 18 },
  section: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  serviceCard: {
    width: "48%",
    minHeight: 106,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    justifyContent: "space-between"
  },
  serviceCardSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  serviceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  serviceIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  serviceIconSelected: { backgroundColor: colors.primary },
  serviceTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  serviceTitleSelected: { color: colors.primaryDark },
  serviceSubtitle: { color: colors.mutedText, fontSize: 11, lineHeight: 15 },
  smallAction: {
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 4
  },
  smallActionText: { color: colors.primaryDark, fontWeight: "900", fontSize: 12 },
  emptyBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  emptyText: { flex: 1, color: colors.mutedText, fontSize: 13, fontWeight: "700" },
  vehicleList: { gap: 10 },
  vehicleCard: {
    width: 168,
    minHeight: 98,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    justifyContent: "space-between"
  },
  vehicleCardSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  vehicleIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  vehicleIconSelected: { backgroundColor: colors.primary },
  vehicleTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  vehicleTitleSelected: { color: colors.primaryDark },
  vehicleText: { color: colors.mutedText, fontSize: 12 },
  locationButton: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  locationTitle: { color: colors.primaryDark, fontSize: 13, fontWeight: "900" },
  locationText: { marginTop: 3, color: colors.mutedText, fontSize: 12, lineHeight: 16 },
  coordinateRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  reviewBox: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14
  },
  reviewTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginBottom: 8 },
  summaryLine: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  summaryLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  summaryValue: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "900", textAlign: "right" },
  estimateRow: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  estimateLabel: { color: colors.text, fontSize: 13, fontWeight: "900" },
  estimateValue: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  footer: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  error: { color: colors.danger, fontWeight: "800", marginBottom: 10 }
});
