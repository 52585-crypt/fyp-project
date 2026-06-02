import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../../../src/theme/colors";
import { RAButton } from "../../../src/components/RAButton";
import { useAuth } from "../../../src/auth/AuthProvider";
import type { Vehicle } from "../../../src/vehicles/vehicles.types";
import { deleteVehicle, listMyVehicles } from "../../../src/vehicles/vehicles.api";

function vehicleIcon(type: Vehicle["type"]) {
  if (type === "bike") return "bicycle";
  if (type === "towing") return "car";
  return "car-sport";
}

export default function VehiclesIndex() {
  const { token } = useAuth();
  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      setItems(await listMyVehicles(token));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function onDelete(id: string) {
    if (!token) return;
    try {
      await deleteVehicle(token, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Delete failed");
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>My Vehicles</Text>
            <Text style={styles.subtitle}>{items.length} saved vehicle{items.length === 1 ? "" : "s"}</Text>
          </View>
          <Pressable onPress={() => router.push("/vehicles/add")} style={styles.addButton}>
            <Ionicons name="add" size={22} color={colors.primaryDark} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <Text style={styles.hint}>Loading vehicles...</Text> : null}

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.vehicleCard}>
              <View style={styles.vehicleHeader}>
                <View style={styles.vehicleIcon}>
                  <Ionicons name={vehicleIcon(item.type)} size={18} color="white" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    {item.make} {item.model}
                  </Text>
                  <Text style={styles.cardSub}>{item.type.toUpperCase()} - {item.year}</Text>
                </View>
                <Pressable onPress={() => onDelete(item.id)} style={styles.deleteButton}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Registration</Text>
                <Text style={styles.metaValue}>{item.registrationNumber || "Not added"}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="car-outline" size={28} color={colors.primaryDark} />
                </View>
                <Text style={styles.emptyTitle}>No vehicles yet</Text>
                <Text style={styles.emptySub}>Add your vehicle once, then roadside requests become faster.</Text>
                <RAButton title="Add vehicle" onPress={() => router.push("/vehicles/add")} style={styles.emptyButton} />
              </View>
            ) : null
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 18 },
  topbar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "900", color: colors.text },
  subtitle: { marginTop: 3, fontSize: 13, color: colors.mutedText, fontWeight: "700" },
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft
  },
  listContent: { paddingBottom: 30 },
  vehicleCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 12
  },
  vehicleHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  vehicleIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  cardTitle: { fontSize: 15, fontWeight: "900", color: colors.text },
  cardSub: { marginTop: 3, fontSize: 12, color: colors.mutedText, fontWeight: "700" },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  metaRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  metaLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "800" },
  metaValue: { flex: 1, textAlign: "right", color: colors.text, fontSize: 12, fontWeight: "900" },
  empty: {
    marginTop: 70,
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  emptyTitle: { marginTop: 12, fontSize: 17, fontWeight: "900", color: colors.text },
  emptySub: { marginTop: 6, textAlign: "center", color: colors.mutedText, fontSize: 13, lineHeight: 18 },
  emptyButton: { alignSelf: "stretch", marginTop: 14 },
  error: { color: colors.danger, fontWeight: "800", marginBottom: 10 },
  hint: { color: colors.mutedText, marginBottom: 10, fontWeight: "700" }
});
