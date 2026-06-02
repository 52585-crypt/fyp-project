import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { AppShell, BottomNav, Card, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const steps = ["Accepted", "Arrived", "Started", "Completed"];

export default function ProviderJobs() {
  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Active Job" subtitle="Update request status as work progresses.">
        <View style={styles.map}>
          <View style={styles.route} />
          <View style={styles.pin}><Ionicons name="location" size={18} color="white" /></View>
          <Text style={styles.mapText}>Customer route</Text>
        </View>

        <Card style={styles.customer}>
          <View style={styles.customerTop}>
            <IconBox icon="person" />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>Ali Hassan</Text>
              <Text style={styles.meta}>Honda Civic - Gulberg 3, Lahore</Text>
            </View>
            <StatusPill label="Towing" />
          </View>
          <View style={styles.actions}>
            <PrimaryButton title="Call" icon="call" style={{ flex: 1 }} />
            <PrimaryButton title="Chat" icon="chatbubble" variant="outline" style={{ flex: 1 }} />
          </View>
        </Card>

        <Card style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={[styles.stepDot, index === 0 ? styles.stepDotActive : null]} />
              <Text style={[styles.stepText, index === 0 ? styles.stepTextActive : null]}>{step}</Text>
            </View>
          ))}
        </Card>

        <PrimaryButton title="Mark Arrived" icon="navigate" variant="success" />
        <PrimaryButton title="Cancel Job" variant="outline" />
      </AppShell>
      <BottomNav role="provider" active="Jobs" />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 240, borderRadius: 22, backgroundColor: ui.colors.primarySoft, overflow: "hidden", borderWidth: 1, borderColor: ui.colors.border, marginBottom: 12 },
  route: { position: "absolute", width: 420, height: 90, borderRadius: 60, backgroundColor: "rgba(37,99,235,0.28)", transform: [{ rotate: "20deg" }], left: -60, top: 94 },
  pin: { position: "absolute", right: 70, top: 76, width: 38, height: 38, borderRadius: 19, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center" },
  mapText: { position: "absolute", left: 16, top: 16, color: ui.colors.primaryDark, fontSize: 13, fontWeight: "900" },
  customer: { gap: 14 },
  customerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  meta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10 },
  steps: { marginTop: 12, gap: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: ui.colors.border },
  stepDotActive: { backgroundColor: ui.colors.success },
  stepText: { color: ui.colors.muted, fontSize: 13, fontWeight: "800" },
  stepTextActive: { color: ui.colors.text }
});

