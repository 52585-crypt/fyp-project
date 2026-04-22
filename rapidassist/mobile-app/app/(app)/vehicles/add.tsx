import React, { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../../../src/theme/colors";
import { RATextInput } from "../../../src/components/RATextInput";
import { RAButton } from "../../../src/components/RAButton";
import { useAuth } from "../../../src/auth/AuthProvider";
import type { VehicleType } from "../../../src/vehicles/vehicles.types";
import { createVehicle } from "../../../src/vehicles/vehicles.api";

function TypePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, selected ? styles.pillSelected : null]}>
      <Text style={[styles.pillText, selected ? styles.pillTextSelected : null]}>{label}</Text>
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
    const y = Number(year);
    return make.trim().length >= 2 && model.trim().length >= 1 && Number.isFinite(y) && y >= 1970;
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
      <View style={styles.container}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Add Vehicle</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.pillsRow}>
            <TypePill label="Car" selected={type === "car"} onPress={() => setType("car")} />
            <TypePill label="Bike" selected={type === "bike"} onPress={() => setType("bike")} />
            <TypePill label="Towing" selected={type === "towing"} onPress={() => setType("towing")} />
          </View>

          <View style={{ height: 12 }} />
          <RATextInput icon="business" placeholder="Make (e.g. Toyota)" value={make} onChangeText={setMake} />
          <View style={{ height: 12 }} />
          <RATextInput icon="car" placeholder="Model (e.g. Corolla)" value={model} onChangeText={setModel} />
          <View style={{ height: 12 }} />
          <RATextInput icon="calendar" placeholder="Year (e.g. 2018)" keyboardType="number-pad" value={year} onChangeText={setYear} />
          <View style={{ height: 12 }} />
          <RATextInput
            icon="card"
            placeholder="Registration (optional)"
            value={registrationNumber}
            onChangeText={setRegistrationNumber}
          />

          {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>You can skip registration number if unknown.</Text>}

          <View style={{ height: 14 }} />
          <RAButton title={loading ? "Please wait..." : "Save vehicle"} disabled={!canSubmit || loading} onPress={onSubmit} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 18 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, fontWeight: "900", color: colors.text },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  card: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 16
  },
  label: { fontSize: 12, color: colors.mutedText, fontWeight: "800", marginBottom: 8 },
  pillsRow: { flexDirection: "row", gap: 10 },
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
  pillText: { fontWeight: "800", color: colors.text },
  pillTextSelected: { color: colors.primaryDark },
  hint: { marginTop: 10, color: colors.mutedText, fontSize: 12 },
  error: { marginTop: 10, color: colors.danger, fontSize: 12, fontWeight: "700" }
});

