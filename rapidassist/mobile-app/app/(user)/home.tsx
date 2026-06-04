import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import type { RequestCategory } from "../../src/requests/requests.types";
import { AppShell, BottomNav, Card, IconBox, Metric, PrimaryButton, SectionTitle, StatusPill } from "../../src/ui/components";
import { ui } from "../../src/ui/system";

const services = [
  { title: "Car Towing", icon: "car", category: "car_towing", tone: "primary" },
  { title: "Fuel Delivery", icon: "water", category: "fuel_delivery", tone: "warning" },
  { title: "Mechanic", icon: "construct", category: "mechanic", tone: "success" }
] as const;

function openRequest(category?: RequestCategory) {
  router.push({
    pathname: "/(user)/request",
    params: category ? { category } : undefined
  });
}

export default function UserHome() {
  const { user } = useAuth();

  return (
    <View style={{ flex: 1 }}>
      <AppShell
        title={`Hi, ${user?.name || "User"}`}
        subtitle="Gulberg 3, Lahore"
        right={
          <Pressable style={styles.bell}>
            <Ionicons name="notifications" size={20} color={ui.colors.text} />
          </Pressable>
        }
      >
        <Card style={styles.hero}>
          <View style={{ flex: 1 }}>
            <StatusPill label="24/7 Roadside Support" />
            <Text style={styles.heroTitle}>Need help for your vehicle?</Text>
            <Text style={styles.heroText}>Request car towing, fuel delivery, or mechanic assistance from verified providers.</Text>
            <PrimaryButton title="Create Request" icon="flash" onPress={() => openRequest()} style={{ marginTop: 14 }} />
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="car-sport" size={46} color="white" />
          </View>
        </Card>

        <View style={styles.metrics}>
          <Metric label="Avg arrival" value="12 min" icon="timer" />
          <Metric label="Active providers" value="48" icon="people" />
        </View>

        <SectionTitle title="Services" action="View all" />
        <View style={styles.grid}>
          {services.map((service) => (
            <Pressable key={service.title} onPress={() => openRequest(service.category)} style={styles.service}>
              <IconBox icon={service.icon} tone={service.tone} />
              <Text style={styles.serviceTitle}>{service.title}</Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle title="Active request" />
        <Card style={styles.active}>
          <View style={styles.activeTop}>
            <IconBox icon="navigate" />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle}>No active request</Text>
              <Text style={styles.activeText}>Start a request and track provider arrival here.</Text>
            </View>
          </View>
          <PrimaryButton title="Emergency SOS" icon="alert" variant="danger" onPress={() => openRequest()} />
        </Card>
      </AppShell>
      <BottomNav role="user" active="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  bell: { width: 42, height: 42, borderRadius: 14, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: ui.colors.primary, borderColor: ui.colors.primary, flexDirection: "row", alignItems: "center", gap: 12 },
  heroTitle: { marginTop: 12, color: "white", fontSize: 23, lineHeight: 29, fontWeight: "900" },
  heroText: { marginTop: 8, color: "rgba(255,255,255,0.86)", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  heroIcon: { width: 88, height: 88, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  metrics: { marginTop: 12, flexDirection: "row", gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  service: { flex: 1, minHeight: 118, borderRadius: 18, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, padding: 10, alignItems: "center", justifyContent: "center", gap: 10 },
  serviceTitle: { color: ui.colors.text, fontSize: 12, lineHeight: 16, fontWeight: "900", textAlign: "center" },
  active: { gap: 14 },
  activeTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  activeTitle: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  activeText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 }
});
