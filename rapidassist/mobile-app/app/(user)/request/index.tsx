import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AppShell, BottomNav, Card, Field, IconBox, PrimaryButton, SectionTitle, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const categories = ["Towing", "Fuel", "Mechanic", "Battery", "Tyre", "Lockout"];

export default function UserRequest() {
  const [selected, setSelected] = useState("Towing");

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Create Request" subtitle="Tell us what happened. We will match the nearest provider.">
        <SectionTitle title="Select service" />
        <View style={styles.categoryGrid}>
          {categories.map((item) => {
            const active = selected === item;
            return (
              <Pressable key={item} onPress={() => setSelected(item)} style={[styles.category, active ? styles.categoryActive : null]}>
                <Text style={[styles.categoryText, active ? styles.categoryTextActive : null]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle title="Trip details" />
        <Card style={styles.form}>
          <Field label="Pickup location" icon="locate" value="Gulberg 3, Lahore" />
          <Field label="Destination" icon="flag" placeholder="Workshop or destination" />
          <Field label="Vehicle" icon="car" value="Honda Civic - LEA 2244" />
          <Field label="Problem" icon="alert-circle" placeholder="Describe issue" />
        </Card>

        <SectionTitle title="Estimate" />
        <Card style={styles.estimate}>
          <View style={styles.estimateRow}>
            <IconBox icon="receipt" />
            <View style={{ flex: 1 }}>
              <Text style={styles.estimateTitle}>PKR 2,788</Text>
              <Text style={styles.estimateText}>Includes base fee, distance, and arrival charge.</Text>
            </View>
            <StatusPill label="Cash" tone="warning" />
          </View>
          <PrimaryButton title="Confirm and Find Provider" icon="search" onPress={() => router.push("/(user)/tracking")} />
        </Card>
      </AppShell>
      <BottomNav role="user" active="Request" />
    </View>
  );
}

const styles = StyleSheet.create({
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  category: { width: "31.8%", height: 48, borderRadius: 14, borderWidth: 1, borderColor: ui.colors.border, backgroundColor: ui.colors.surface, alignItems: "center", justifyContent: "center" },
  categoryActive: { backgroundColor: ui.colors.primary, borderColor: ui.colors.primary },
  categoryText: { color: ui.colors.text, fontSize: 12, fontWeight: "900" },
  categoryTextActive: { color: "white" },
  form: { gap: 12 },
  estimate: { gap: 14 },
  estimateRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  estimateTitle: { color: ui.colors.text, fontSize: 19, fontWeight: "900" },
  estimateText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 }
});

