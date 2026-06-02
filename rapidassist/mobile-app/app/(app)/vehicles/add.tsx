import React, { useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../../../src/theme/colors";
import { RAButton } from "../../../src/components/RAButton";
import { RATextInput } from "../../../src/components/RATextInput";
import { useAuth } from "../../../src/auth/AuthProvider";
import type { VehicleType } from "../../../src/vehicles/vehicles.types";
import { createVehicle } from "../../../src/vehicles/vehicles.api";

const vehicleTypes: Array<{ label: string; value: VehicleType; icon: keyof typeof Ionicons.glyphMap }> = [
  { label: "Car", value: "car", icon: "car-sport" },
  { label: "Bike", value: "bike", icon: "bicycle" },
  { label: "Towing", value: "towing", icon: "car" }
];

function TypeCard({
  label,
  icon,
  selected,
  onPress
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.typeCard, selected ? styles.typeCardSelected : null]}>
      <View style={[styles.typeIcon, selected ? styles.typeIconSelected : null]}>
        <Ionicons name={icon} size={18} color={selected ? "white" : colors.primaryDark} />
      </View>
      <Text style={[styles.typeText, selected ? styles.typeTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export default function AddVehicle() {
  const { token } = useAuth();
  const [type, setType] = useState<VehicleType>("car");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const parsedYear = Number(year);
    return make.trim().length >= 2 && model.trim().length >= 1 && Number.isFinite(parsedYear) && parsedYear >= 1970;
  }, [make, model, year]);

  async function onSubmit() {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      await createVehicle(token, {
        type,
        make: make.trim(),
        model: model.trim(),
        year: Number(year),
        registrationNumber: registrationNumber.trim() ? registrationNumber.trim() : null
      });
      router.replace("/(app)/vehicles");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to add vehicle");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Add Vehicle</Text>
            <Text style={styles.subtitle}>Save details for faster help requests.</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Vehicle type</Text>
          <View style={styles.typeGrid}>
            {vehicleTypes.map((item) => (
              <TypeCard
                key={item.value}
                label={item.label}
                icon={item.icon}
                selected={type === item.value}
                onPress={() => setType(item.value)}
              />
            ))}
          </View>

          <Text style={styles.sectionTitle}>Vehicle details</Text>
          <RATextInput icon="business" placeholder="Make (e.g. Toyota)" value={make} onChangeText={setMake} />
          <View style={{ height: 12 }} />
          <RATextInput icon="car" placeholder="Model (e.g. Corolla)" value={model} onChangeText={setModel} />
          <View style={{ height: 12 }} />
          <RATextInput icon="calendar" placeholder="Year (e.g. 2018)" keyboardType="number-pad" value={year} onChangeText={setYear} />
          <View style={{ height: 12 }} />
          <RATextInput icon="card" placeholder="Registration number (optional)" value={registrationNumber} onChangeText={setRegistrationNumber} />

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <View style={styles.note}>
              <Ionicons name="information-circle" size={18} color={colors.primaryDark} />
              <Text style={styles.noteText}>Registration number can be skipped if you do not have it now.</Text>
            </View>
          )}
        </View>

        <RAButton title={loading ? "Saving..." : "Save vehicle"} disabled={!canSubmit || loading} onPress={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 18, paddingBottom: 34 },
  topbar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  title: { fontSize: 22, fontWeight: "900", color: colors.text },
  subtitle: { marginTop: 3, fontSize: 13, color: colors.mutedText, fontWeight: "700" },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 14
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginBottom: 10, marginTop: 4 },
  typeGrid: { flexDirection: "row", gap: 10, marginBottom: 14 },
  typeCard: {
    flex: 1,
    minHeight: 86,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  typeCardSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  typeIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7
  },
  typeIconSelected: { backgroundColor: colors.primary },
  typeText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  typeTextSelected: { color: colors.primaryDark },
  note: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 10,
    flexDirection: "row",
    gap: 8
  },
  noteText: { flex: 1, color: colors.primaryDark, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  error: { marginTop: 12, color: colors.danger, fontSize: 12, fontWeight: "800" }
});
