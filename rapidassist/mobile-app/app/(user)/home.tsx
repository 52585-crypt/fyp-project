import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { listMyRequests } from "../../src/requests/requests.api";
import { getServiceIcon, getServiceTitle } from "../../src/requests/serviceCatalog";
import type { RequestCategory, ServiceRequest } from "../../src/requests/requests.types";
import { AppShell, BottomNav, Card, IconBox, PrimaryButton, SectionTitle, StatusPill } from "../../src/ui/components";
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
  const { token, user } = useAuth();
  const [activeRequest, setActiveRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboardRequests() {
    if (!token) return;
    try {
      setError(null);
      const requests = await listMyRequests(token);
      setActiveRequest(requests.find((item) => item.status !== "completed" && item.status !== "cancelled") || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load dashboard requests");
    }
  }

  useEffect(() => {
    loadDashboardRequests();
  }, [token]);

  return (
    <View style={{ flex: 1 }}>
      <AppShell
        title={`Hi, ${user?.name?.split(" ")[0] || "there"}`}
        subtitle="Let's get you back on the road."
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => router.push("/(user)/profile")} style={styles.bell}>
            <Ionicons name="person-outline" size={20} color={ui.colors.primary} />
          </Pressable>
        }
      >
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroBadge}><View style={styles.liveDot} /><Text style={styles.heroBadgeText}>ROADSIDE ASSISTANCE</Text></View>
            <View style={styles.heroIcon}><Ionicons name="car-sport-outline" size={30} color="#B9E6CF" /></View>
          </View>
          <Text style={styles.heroTitle}>A little help.{"\n"}A long way forward.</Text>
          <Text style={styles.heroText}>A breakdown shouldn't stop your day. Find the right help for your vehicle.</Text>
          <PrimaryButton title="Request assistance" icon="arrow-forward" onPress={() => openRequest()} style={{ marginTop: 22 }} />
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <SectionTitle title="How can we help?" />
        <View style={styles.grid}>
          {services.map((service) => (
            <Pressable key={service.title} accessibilityRole="button" accessibilityLabel={`Request ${service.title}`} onPress={() => openRequest(service.category)} style={({ pressed }) => [styles.service, pressed ? { opacity: 0.7 } : null]}>
              <IconBox icon={service.icon} tone={service.tone} />
              <Text style={styles.serviceTitle}>{service.title}</Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle title="Your journey" />
        <Card style={styles.active}>
          <View style={styles.activeTop}>
            <IconBox icon={activeRequest ? getServiceIcon(activeRequest.category) : "navigate"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle}>{activeRequest ? getServiceTitle(activeRequest.category) : "No active request"}</Text>
              <Text style={styles.activeText}>
                {activeRequest
                  ? `${activeRequest.status.replaceAll("_", " ")} - ${activeRequest.pickupLocation?.addressText || "Pickup location"}`
                  : "Start a request and track provider arrival here."}
              </Text>
            </View>
            {activeRequest ? <StatusPill label={activeRequest.status.replaceAll("_", " ")} tone="warning" /> : null}
          </View>
          <View style={styles.activeActions}>
            <PrimaryButton
              title={activeRequest ? "Track request" : "Get help"}
              icon={activeRequest ? "navigate" : "add-circle-outline"}
              variant="primary"
              style={{ flex: 1 }}
              onPress={() => (activeRequest ? router.push("/(user)/tracking") : openRequest())}
            />
            <PrimaryButton
              title="History"
              icon="receipt"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => router.push("/(user)/history")}
            />
          </View>
        </Card>
      </AppShell>
      <BottomNav role="user" active="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  bell: { width: 46, height: 46, borderRadius: 23, backgroundColor: ui.colors.primarySoft, alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: ui.colors.dark, borderColor: ui.colors.dark, padding: 22, borderRadius: 24 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#80DBAF" },
  heroBadgeText: { color: "#B9E6CF", fontSize: 9, fontWeight: "700", letterSpacing: 1.2, flexShrink: 1 },
  heroTitle: { marginTop: 18, color: "white", fontSize: 29, lineHeight: 36, letterSpacing: -0.8, fontWeight: "800" },
  heroText: { marginTop: 10, color: "#BED3C9", fontSize: 13, lineHeight: 21, fontWeight: "400" },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#FFFFFF0D", alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  service: { flex: 1, minHeight: 120, borderRadius: 18, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.border, padding: 10, alignItems: "center", justifyContent: "center", gap: 12 },
  serviceTitle: { color: ui.colors.text, fontSize: 12, lineHeight: 17, fontWeight: "600", textAlign: "center" },
  active: { gap: 14 },
  activeActions: { flexDirection: "row", gap: 10 },
  activeTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  activeTitle: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  activeText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  error: { marginTop: 10, color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});
