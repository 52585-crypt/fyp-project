import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Card, IconBox, PrimaryButton, StatusPill } from "../../src/ui/components";
import { ui } from "../../src/ui/system";

export default function Welcome() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Ionicons name="car-sport" size={30} color="white" />
          </View>
          <View>
            <Text style={styles.brand}>RapidAssist</Text>
            <Text style={styles.tagline}>Roadside help in seconds</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <StatusPill label="User + Provider App" />
          <Text style={styles.title}>Fast roadside support, built for real emergencies.</Text>
          <Text style={styles.subtitle}>
            Request help as a user or receive verified jobs as a provider from one mobile app.
          </Text>
          <View style={styles.heroArt}>
            <View style={styles.road} />
            <View style={styles.car}><Ionicons name="car" size={30} color="white" /></View>
            <View style={styles.pin}><Ionicons name="location" size={20} color="white" /></View>
          </View>
        </View>

        <View style={styles.cards}>
          <Card style={styles.roleCard}>
            <IconBox icon="person" />
            <View style={{ flex: 1 }}>
              <Text style={styles.roleTitle}>For users</Text>
              <Text style={styles.roleText}>Towing, fuel, mechanic, battery, tyre, and lockout assistance.</Text>
            </View>
          </Card>
          <Card style={styles.roleCard}>
            <IconBox icon="construct" tone="dark" />
            <View style={{ flex: 1 }}>
              <Text style={styles.roleTitle}>For providers</Text>
              <Text style={styles.roleText}>Go online, accept jobs, track work, and manage earnings.</Text>
            </View>
          </Card>
        </View>

        <View style={styles.actions}>
          <PrimaryButton title="Login" icon="log-in" onPress={() => router.push("/(auth)/login")} />
          <PrimaryButton title="Create Account" icon="person-add" variant="dark" onPress={() => router.push("/(auth)/signup")} />
          <Pressable onPress={() => router.push("/(auth)/signup")} style={styles.providerLink}>
            <Text style={styles.providerText}>Register as provider</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.colors.bg },
  container: { flex: 1, padding: 18 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  logo: { width: 54, height: 54, borderRadius: 18, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center" },
  brand: { color: ui.colors.text, fontSize: 23, fontWeight: "900" },
  tagline: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "800" },
  hero: { marginTop: 26 },
  title: { marginTop: 14, color: ui.colors.text, fontSize: 32, lineHeight: 38, fontWeight: "900" },
  subtitle: { marginTop: 10, color: ui.colors.muted, fontSize: 15, lineHeight: 22, fontWeight: "700" },
  heroArt: { marginTop: 22, height: 170, borderRadius: 26, backgroundColor: ui.colors.primarySoft, overflow: "hidden", borderWidth: 1, borderColor: ui.colors.border },
  road: { position: "absolute", left: -40, top: 76, width: 420, height: 80, borderRadius: 50, backgroundColor: "rgba(37,99,235,0.25)", transform: [{ rotate: "-17deg" }] },
  car: { position: "absolute", left: 64, top: 78, width: 54, height: 54, borderRadius: 18, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center" },
  pin: { position: "absolute", right: 70, top: 48, width: 42, height: 42, borderRadius: 21, backgroundColor: ui.colors.danger, alignItems: "center", justifyContent: "center" },
  cards: { marginTop: 18, gap: 10 },
  roleCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  roleTitle: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  roleText: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  actions: { marginTop: "auto", gap: 10 },
  providerLink: { height: 44, alignItems: "center", justifyContent: "center" },
  providerText: { color: ui.colors.primary, fontSize: 13, fontWeight: "900" }
});

