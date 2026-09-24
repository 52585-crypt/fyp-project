import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Card, IconBox, PrimaryButton, StatusPill } from "../../src/ui/components";
import { ui } from "../../src/ui/system";

export default function Welcome() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Ionicons name="car-sport" size={30} color="white" />
            </View>
            <View>
              <Text style={styles.brand}>RapidAssist</Text>
              <Text style={styles.tagline}>A little help. A long way forward.</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <StatusPill label="YOUR ROADSIDE COMPANION" />
            <Text style={styles.title}>Every journey{"\n"}deserves a backup.</Text>
            <Text style={styles.subtitle}>
              From an empty tank to an unexpected breakdown, find the help you need to keep moving.
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
                <Text style={styles.roleTitle}>Help for your vehicle</Text>
                <Text style={styles.roleText}>Towing, fuel delivery, and mechanic assistance.</Text>
              </View>
            </Card>
            <Card style={styles.roleCard}>
              <IconBox icon="construct" tone="dark" />
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>Put your skills to work</Text>
                <Text style={styles.roleText}>Go online, accept jobs, track work, and manage earnings.</Text>
              </View>
            </Card>
          </View>
        </View>

        <View style={styles.actions}>
          <PrimaryButton title="Get started" icon="arrow-forward" onPress={() => router.push("/(auth)/signup")} />
          <PrimaryButton title="I already have an account" variant="outline" onPress={() => router.push("/(auth)/login")} />
          <Pressable onPress={() => router.push("/(auth)/signup")} style={styles.providerLink}>
            <Text style={styles.providerText}>Register as provider</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.colors.bg },
  container: { flexGrow: 1, padding: 24, paddingBottom: 32, justifyContent: "space-between", gap: 24, width: "100%", maxWidth: 620, alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  logo: { width: 54, height: 54, borderRadius: 18, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center" },
  brand: { color: ui.colors.text, fontSize: 23, fontWeight: "900" },
  tagline: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "800" },
  hero: { marginTop: 26 },
  title: { marginTop: 18, color: ui.colors.text, fontSize: 36, lineHeight: 43, fontWeight: "800", letterSpacing: -1.2 },
  subtitle: { marginTop: 12, color: ui.colors.muted, fontSize: 14, lineHeight: 23, fontWeight: "400" },
  heroArt: { marginTop: 22, height: 170, borderRadius: 26, backgroundColor: ui.colors.primarySoft, overflow: "hidden", borderWidth: 1, borderColor: ui.colors.border },
  road: { position: "absolute", left: "-10%", top: 76, width: "120%", height: 80, borderRadius: 50, backgroundColor: "#C0E1D0", transform: [{ rotate: "-17deg" }] },
  car: { position: "absolute", left: 64, top: 78, width: 54, height: 54, borderRadius: 18, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center" },
  pin: { position: "absolute", right: 70, top: 48, width: 42, height: 42, borderRadius: 21, backgroundColor: ui.colors.danger, alignItems: "center", justifyContent: "center" },
  cards: { marginTop: 18, gap: 10 },
  roleCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  roleTitle: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  roleText: { marginTop: 4, color: ui.colors.muted, fontSize: 12, fontWeight: "400", lineHeight: 19 },
  actions: { gap: 10 },
  providerLink: { height: 44, alignItems: "center", justifyContent: "center" },
  providerText: { color: ui.colors.primary, fontSize: 13, fontWeight: "900" }
});
