import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View, Pressable, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { colors } from "../../../src/theme/colors";
import { useAuth } from "../../../src/auth/AuthProvider";
import type { Vehicle } from "../../../src/vehicles/vehicles.types";
import { listMyVehicles, deleteVehicle } from "../../../src/vehicles/vehicles.api";

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
      const v = await listMyVehicles(token);
      setItems(v);
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
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Delete failed");
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>My Vehicles</Text>
          <Link href="/(app)/vehicles/add" asChild>
            <Pressable style={[styles.iconBtn, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]}>
              <Ionicons name="add" size={22} color={colors.primaryDark} />
            </Pressable>
          </Link>
        </View>

        <View style={{ height: 10 }} />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <Text style={styles.hint}>Loading…</Text> : null}

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 30 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.badge}>
                  <Ionicons name={item.type === "bike" ? "bicycle" : item.type === "towing" ? "car" : "car-sport"} size={16} color="white" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    {item.make} {item.model} ({item.year})
                  </Text>
                  <Text style={styles.cardSub}>
                    {item.type.toUpperCase()}
                    {item.registrationNumber ? ` • ${item.registrationNumber}` : ""}
                  </Text>
                </View>

                <Pressable onPress={() => onDelete(item.id)} style={styles.trashBtn}>
                  <Ionicons name="trash" size={18} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Ionicons name="car-outline" size={26} color={colors.mutedText} />
                <Text style={styles.emptyTitle}>No vehicles yet</Text>
                <Text style={styles.emptySub}>Add your vehicle to create service requests faster.</Text>
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 14,
    marginBottom: 10
  },
  row: { flexDirection: "row", alignItems: "center" },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  cardSub: { marginTop: 3, fontSize: 12, color: colors.mutedText },
  trashBtn: { padding: 10, marginLeft: 6 },
  error: { color: colors.danger, fontWeight: "700", marginBottom: 8 },
  hint: { color: colors.mutedText, marginBottom: 8 },
  empty: { marginTop: 60, alignItems: "center", padding: 18 },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: "900", color: colors.text },
  emptySub: { marginTop: 6, textAlign: "center", color: colors.mutedText }
});

