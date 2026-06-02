import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppShell, BottomNav, Card, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const steps = ["Searching", "Assigned", "On way", "Arrived"];

export default function UserTracking() {
  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Live Tracking" subtitle="Provider route and request progress.">
        <View style={styles.map}>
          <View style={styles.road} />
          <View style={styles.pinUser}><Ionicons name="person" size={18} color="white" /></View>
          <View style={styles.pinProvider}><Ionicons name="car" size={18} color="white" /></View>
          <Text style={styles.mapText}>Map preview</Text>
        </View>

        <Card style={styles.provider}>
          <View style={styles.providerTop}>
            <IconBox icon="person" />
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>Rashid Khan</Text>
              <Text style={styles.providerMeta}>Tow Truck - LES 4567 - 12 min away</Text>
            </View>
            <StatusPill label="4.8" tone="warning" />
          </View>
          <View style={styles.actions}>
            <PrimaryButton title="Call" icon="call" style={{ flex: 1 }} />
            <PrimaryButton title="Chat" icon="chatbubble" variant="outline" style={{ flex: 1 }} />
          </View>
        </Card>

        <Card style={styles.stepsCard}>
          {steps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={[styles.stepDot, index <= 1 ? styles.stepDotActive : null]} />
              <Text style={[styles.stepText, index <= 1 ? styles.stepTextActive : null]}>{step}</Text>
            </View>
          ))}
        </Card>
      </AppShell>
      <BottomNav role="user" active="Track" />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 260, borderRadius: 22, backgroundColor: ui.colors.primarySoft, overflow: "hidden", borderWidth: 1, borderColor: ui.colors.border, marginBottom: 12 },
  road: { position: "absolute", width: 420, height: 90, borderRadius: 60, backgroundColor: "rgba(37,99,235,0.28)", transform: [{ rotate: "-24deg" }], left: -40, top: 100 },
  pinUser: { position: "absolute", left: 52, bottom: 48, width: 38, height: 38, borderRadius: 19, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center" },
  pinProvider: { position: "absolute", right: 72, top: 62, width: 38, height: 38, borderRadius: 19, backgroundColor: ui.colors.success, alignItems: "center", justifyContent: "center" },
  mapText: { position: "absolute", left: 16, top: 16, color: ui.colors.primaryDark, fontSize: 13, fontWeight: "900" },
  provider: { gap: 14 },
  providerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  providerName: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  providerMeta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10 },
  stepsCard: { gap: 12, marginTop: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: ui.colors.border },
  stepDotActive: { backgroundColor: ui.colors.primary },
  stepText: { color: ui.colors.muted, fontSize: 13, fontWeight: "800" },
  stepTextActive: { color: ui.colors.text }
});

