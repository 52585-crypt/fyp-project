import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View, Pressable, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../../../src/theme/colors";
import { RAButton } from "../../../src/components/RAButton";
import { RATextInput } from "../../../src/components/RATextInput";
import { useAuth } from "../../../src/auth/AuthProvider";
import type { Vehicle } from "../../../src/vehicles/vehicles.types";
import { listMyVehicles } from "../../../src/vehicles/vehicles.api";
import type { RequestCategory } from "../../../src/requests/requests.types";
import { createRequest } from "../../../src/requests/requests.api";

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, selected ? styles.pillSelected : null]}>
      <Text style={[styles.pillText, selected ? styles.pillTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export default function CreateRequest() {
  const { token } = useAuth();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [category, setCategory] = useState<RequestCategory>("car");
  const [unknownIssue, setUnknownIssue] = useState(false);
  const [issueType, setIssueType] = useState("engine");
  const [description, setDescription] = useState("");

  // Simple location input for V2 (map can come later)
  const [lat, setLat] = useState("31.5204");
  const [lng, setLng] = useState("74.3587");
  const [addressText, setAddressText] = useState("Gulberg, Lahore");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVehicles = useCallback(async () => {
    if (!token) return;
    try {
      const v = await listMyVehicles(token);
      setVehicles(v);
      if (!vehicleId && v.length > 0) setVehicleId(v[0].id);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load vehicles");
    }
  }, [token, vehicleId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const canSubmit = useMemo(() => {
    const la = Number(lat);
    const ln = Number(lng);
    if (!vehicleId) return false;
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
    if (!unknownIssue && issueType.trim().length < 2) return false;
    return true;
  }, [vehicleId, lat, lng, unknownIssue, issueType]);

  async function onSubmit() {
    if (!token || !vehicleId) return;
    try {
      setLoading(true);
      setError(null);

      await createRequest(token, {
        vehicleId,
        category,
        unknownIssue,
        issueType: unknownIssue ? null : issueType.trim(),
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
      <View style={styles.container}>
        {/* Map preview placeholder */}
        <View style={styles.mapPreview}>
          <View style={styles.mapTopRow}>
            <Pressable onPress={() => router.back()} style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.mapTitle}>Request Help</Text>
            <View style={{ width: 44 }} />
          </View>
          <View style={styles.mapPin}>
            <Ionicons name="location" size={20} color="white" />
          </View>
          <Text style={styles.mapHint}>Map preview (V2). We’ll add live map later.</Text>
        </View>

        {/* Bottom sheet */}
        <View style={styles.sheet}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionTitle}>Vehicle</Text>
          {vehicles.length === 0 ? (
            <View style={styles.emptyVehicles}>
              <Text style={styles.emptyVehiclesText}>No vehicles found. Add a vehicle first.</Text>
              <Pressable onPress={() => router.push("/(app)/vehicles/add")} style={styles.addVehicleLink}>
                <Text style={styles.addVehicleLinkText}>Add Vehicle</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={vehicles}
              keyExtractor={(v) => v.id}
              renderItem={({ item }) => {
                const selected = item.id === vehicleId;
                return (
                  <Pressable
                    onPress={() => setVehicleId(item.id)}
                    style={[styles.vehicleCard, selected ? styles.vehicleCardSelected : null]}
                  >
                    <Text style={[styles.vehicleTitle, selected ? { color: colors.primaryDark } : null]}>
                      {item.make} {item.model}
                    </Text>
                    <Text style={styles.vehicleSub}>
                      {item.type.toUpperCase()} • {item.year}
                    </Text>
                  </Pressable>
                );
              }}
              contentContainerStyle={{ gap: 10 }}
            />
          )}

          <View style={{ height: 12 }} />
          <Text style={styles.sectionTitle}>Category</Text>
          <View style={styles.row}>
            <Pill label="Car" selected={category === "car"} onPress={() => setCategory("car")} />
            <Pill label="Bike" selected={category === "bike"} onPress={() => setCategory("bike")} />
            <Pill label="Towing" selected={category === "towing"} onPress={() => setCategory("towing")} />
          </View>

          <View style={{ height: 12 }} />
          <Text style={styles.sectionTitle}>Problem</Text>
          <View style={styles.row}>
            <Pill label="Engine" selected={!unknownIssue && issueType === "engine"} onPress={() => (setUnknownIssue(false), setIssueType("engine"))} />
            <Pill label="Puncture" selected={!unknownIssue && issueType === "puncture"} onPress={() => (setUnknownIssue(false), setIssueType("puncture"))} />
            <Pill label="Battery" selected={!unknownIssue && issueType === "battery"} onPress={() => (setUnknownIssue(false), setIssueType("battery"))} />
          </View>
          <View style={{ height: 10 }} />
          <Pressable onPress={() => setUnknownIssue((v) => !v)} style={styles.unknownRow}>
            <Ionicons name={unknownIssue ? "checkbox" : "square-outline"} size={20} color={unknownIssue ? colors.primary : colors.mutedText} />
            <Text style={styles.unknownText}>I don’t know the problem</Text>
          </Pressable>
          {!unknownIssue ? null : (
            <Text style={styles.hint}>No worries—mechanic can inspect first (inspection mode).</Text>
          )}

          <View style={{ height: 12 }} />
          <Text style={styles.sectionTitle}>Location</Text>
          <RATextInput icon="location" placeholder="Address (optional)" value={addressText} onChangeText={setAddressText} />
          <View style={{ height: 10 }} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <RATextInput icon="navigate" placeholder="Lat" keyboardType="numeric" value={lat} onChangeText={setLat} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <RATextInput icon="navigate" placeholder="Lng" keyboardType="numeric" value={lng} onChangeText={setLng} />
            </View>
          </View>

          <View style={{ height: 12 }} />
          <Text style={styles.sectionTitle}>Extra details (optional)</Text>
          <RATextInput icon="chatbox-ellipses" placeholder="Short description" value={description} onChangeText={setDescription} />

          <View style={{ height: 14 }} />
          <RAButton
            title={loading ? "Sending request..." : "Send request to mechanics"}
            disabled={!canSubmit || loading || vehicles.length === 0}
            onPress={onSubmit}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  mapPreview: {
    height: 250,
    backgroundColor: "#E5E7EB",
    padding: 14,
    justifyContent: "space-between"
  },
  mapTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mapTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  mapPin: {
    alignSelf: "center",
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  mapHint: { textAlign: "center", color: colors.mutedText, fontSize: 12, paddingBottom: 6 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.9)"
  },
  sheet: {
    flex: 1,
    marginTop: -18,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 16
  },
  sectionTitle: { fontSize: 12, fontWeight: "900", color: colors.mutedText, marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center"
  },
  pillSelected: { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" },
  pillText: { fontWeight: "900", color: colors.text, fontSize: 12 },
  pillTextSelected: { color: colors.primaryDark },
  error: { color: colors.danger, fontWeight: "800", marginBottom: 8 },
  vehicleCard: {
    width: 170,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12
  },
  vehicleCardSelected: { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" },
  vehicleTitle: { fontSize: 14, fontWeight: "900", color: colors.text },
  vehicleSub: { marginTop: 4, fontSize: 12, color: colors.mutedText },
  emptyVehicles: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12
  },
  emptyVehiclesText: { color: colors.mutedText, fontWeight: "700" },
  addVehicleLink: { marginTop: 10, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#DCFCE7" },
  addVehicleLinkText: { color: colors.primaryDark, fontWeight: "900" },
  unknownRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  unknownText: { fontWeight: "800", color: colors.text },
  hint: { marginTop: 8, color: colors.mutedText, fontSize: 12 }
});

