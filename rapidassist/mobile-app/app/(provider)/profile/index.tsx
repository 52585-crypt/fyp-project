import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { AppShell, BottomNav, Card, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

export default function ProviderProfile() {
  const { user, logout } = useAuth();

  async function onLogout() {
    await logout();
    router.replace("/(auth)/welcome");
  }

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Provider Profile" subtitle="Service category, verification, and documents.">
        <Card style={styles.profile}>
          <View style={styles.avatar}><Ionicons name="construct" size={32} color="white" /></View>
          <Text style={styles.name}>{user?.name || "Provider"}</Text>
          <Text style={styles.phone}>{user?.phone || "0300 0000000"}</Text>
          <StatusPill label={user?.verificationStatus || "pending"} tone={user?.verificationStatus === "verified" ? "success" : "warning"} />
        </Card>

        {["Service category", "Verification documents", "Workshop information", "Support"].map((item) => (
          <Card key={item} style={styles.row}>
            <IconBox icon={item === "Service category" ? "construct" : item === "Verification documents" ? "shield-checkmark" : item === "Workshop information" ? "business" : "headset"} />
            <Text style={styles.rowText}>{item}</Text>
            <Ionicons name="chevron-forward" size={18} color={ui.colors.muted} />
          </Card>
        ))}

        <PrimaryButton title="Logout" icon="log-out" variant="outline" onPress={onLogout} />
      </AppShell>
      <BottomNav role="provider" active="Profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: "center", gap: 7, marginBottom: 12 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: ui.colors.dark, alignItems: "center", justifyContent: "center" },
  name: { color: ui.colors.text, fontSize: 19, fontWeight: "900" },
  phone: { color: ui.colors.muted, fontSize: 13, fontWeight: "800" },
  row: { marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1, color: ui.colors.text, fontSize: 14, fontWeight: "900" }
});

