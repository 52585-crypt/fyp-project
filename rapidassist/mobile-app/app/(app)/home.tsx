import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../../src/theme/colors";
import { useAuth } from "../../src/auth/AuthProvider";
import { listMyRequests } from "../../src/requests/requests.api";
import type { ServiceRequest } from "../../src/requests/requests.types";

const serviceTiles: Array<{
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { title: "Car Towing", subtitle: "Vehicle towing", icon: "car" },
  { title: "Fuel Delivery", subtitle: "At your location", icon: "water" },
  { title: "Mechanic", subtitle: "On-demand", icon: "construct" },
  { title: "Battery Jump", subtitle: "Start your vehicle", icon: "battery-charging" },
  { title: "Tyre Change", subtitle: "Flat tyre help", icon: "radio-button-on" },
  { title: "More", subtitle: "View all", icon: "ellipsis-horizontal" }
];

function statusLabel(status?: ServiceRequest["status"]) {
  if (!status) return "No active request";
  if (status !== "completed" && status !== "cancelled") return "Request in progress";
  if (status === "completed") return "Last request completed";
  return "Last request cancelled";
}

function ServiceTile({
  title,
  subtitle,
  icon,
  onPress
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.serviceTile}>
      <View style={styles.serviceIcon}>
        <Ionicons name={icon} size={23} color={colors.primary} />
      </View>
      <Text style={styles.serviceTitle}>{title}</Text>
      <Text style={styles.serviceSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

function BottomTab({
  icon,
  label,
  active,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tabItem}>
      <Ionicons name={icon} size={20} color={active ? colors.primary : colors.mutedText} />
      <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

export default function Home() {
  const { token, user, logout } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setRequests(await listMyRequests(token));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load request status");
    }
  }, [token]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const activeRequest = useMemo(
    () => requests.find((request) => request.status !== "completed" && request.status !== "cancelled") || requests[0] || null,
    [requests]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.topbar}>
            <Pressable style={styles.iconButton}>
              <Ionicons name="menu" size={22} color={colors.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Hello, {user?.name || "User"}</Text>
            </View>
            <Pressable onPress={logout} style={styles.iconButton}>
              <Ionicons name="notifications-outline" size={21} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.locationBlock}>
            <Ionicons name="location" size={17} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationLabel}>Your Location</Text>
              <Text style={styles.locationText}>Gulberg 3, Lahore, Pakistan</Text>
            </View>
          </View>

          <Pressable onPress={() => router.push("/request/create")} style={styles.hero}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Need Help for Your Vehicle?</Text>
              <Text style={styles.heroText}>24/7 support - fast and reliable</Text>
              <View style={styles.heroButton}>
                <Text style={styles.heroButtonText}>Get Help Now</Text>
              </View>
            </View>
            <View style={styles.heroArt}>
              <Ionicons name="car-sport" size={46} color="white" />
              <Ionicons name="construct" size={24} color="white" style={styles.heroTool} />
            </View>
          </Pressable>

          <Text style={styles.sectionTitle}>Our Services</Text>
          <View style={styles.serviceGrid}>
            {serviceTiles.map((item) => (
              <ServiceTile
                key={item.title}
                title={item.title}
                subtitle={item.subtitle}
                icon={item.icon}
                onPress={() => router.push("/request/create")}
              />
            ))}
          </View>

          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <Text style={styles.statusTitle}>{statusLabel(activeRequest?.status)}</Text>
              <Pressable onPress={loadRequests} style={styles.refreshButton}>
                <Ionicons name="refresh" size={16} color={colors.primary} />
              </Pressable>
            </View>
            <Text style={styles.statusText}>
              {activeRequest
                ? `${activeRequest.category.toUpperCase()} - ${activeRequest.issueType || "Unknown issue"}`
                : "Start a new request when you need support."}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>

        <View style={styles.bottomNav}>
          <BottomTab icon="home" label="Home" active onPress={() => undefined} />
          <BottomTab icon="reader-outline" label="Requests" onPress={() => router.push("/request/create")} />
          <BottomTab icon="headset-outline" label="Support" onPress={() => undefined} />
          <BottomTab icon="person-outline" label="Profile" onPress={logout} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  shell: { flex: 1 },
  container: { padding: 18, paddingBottom: 96 },
  topbar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "900" },
  locationBlock: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  locationLabel: { color: colors.mutedText, fontSize: 11, fontWeight: "800" },
  locationText: { marginTop: 2, color: colors.text, fontSize: 12, fontWeight: "800" },
  hero: {
    minHeight: 144,
    borderRadius: 16,
    backgroundColor: colors.primary,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden"
  },
  heroTitle: { color: "white", fontSize: 20, fontWeight: "900", lineHeight: 25 },
  heroText: { marginTop: 5, color: "rgba(255,255,255,0.86)", fontSize: 12, fontWeight: "700" },
  heroButton: {
    alignSelf: "flex-start",
    marginTop: 14,
    borderRadius: 10,
    backgroundColor: "white",
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  heroButtonText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  heroArt: {
    width: 102,
    height: 92,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center"
  },
  heroTool: { position: "absolute", right: 14, top: 13 },
  sectionTitle: { marginTop: 18, marginBottom: 10, color: colors.text, fontSize: 15, fontWeight: "900" },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  serviceTile: {
    width: "31.9%",
    minHeight: 112,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 9
  },
  serviceIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8
  },
  serviceTitle: { color: colors.text, fontSize: 11, fontWeight: "900", textAlign: "center" },
  serviceSubtitle: { marginTop: 4, color: colors.mutedText, fontSize: 10, lineHeight: 13, textAlign: "center" },
  statusCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14
  },
  statusHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  statusText: { marginTop: 6, color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 72,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: 8
  },
  tabItem: { alignItems: "center", justifyContent: "center", minWidth: 62 },
  tabLabel: { marginTop: 4, color: colors.mutedText, fontSize: 10, fontWeight: "800" },
  tabLabelActive: { color: colors.primary },
  error: { marginTop: 10, color: colors.danger, fontSize: 12, fontWeight: "800" }
});
