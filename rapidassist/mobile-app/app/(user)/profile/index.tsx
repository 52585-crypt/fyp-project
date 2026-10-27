import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { AppShell, BottomNav, Card, IconBox, PrimaryButton } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

export default function UserProfile() {
  const { user, logout } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function onLogout() {
    if (signingOut) return;
    try {
      setSigningOut(true);
      setError(null);
      await logout();
      router.replace("/(auth)/welcome");
    } catch (error: any) {
      setError(error?.message || "Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Profile" subtitle="Account, vehicles, payments, and support.">
        <Card style={styles.profile}>
          <View style={styles.avatar}><Ionicons name="person" size={32} color="white" /></View>
          <Text style={styles.name}>{user?.name || "User"}</Text>
          <Text style={styles.phone}>{user?.phone || "Phone not added"}</Text>
        </Card>

        {["Vehicles", "Payment methods", "Emergency contacts", "Support center"].map((item) => (
          <Card key={item} style={styles.row}>
            <IconBox icon={item === "Vehicles" ? "car" : item === "Payment methods" ? "card" : item === "Emergency contacts" ? "call" : "headset"} />
            <Text style={styles.rowText}>{item}</Text>
            <Ionicons name="chevron-forward" size={18} color={ui.colors.muted} />
          </Card>
        ))}

        {error ? <Text accessibilityRole="alert" style={{ color: ui.colors.danger, marginBottom: 12 }}>{error}</Text> : null}
        <PrimaryButton title={signingOut ? "Signing out…" : "Logout"} disabled={signingOut} icon="log-out" variant="outline" onPress={onLogout} />
      </AppShell>
      <BottomNav role="user" active="Profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: "center", marginBottom: 12 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: ui.colors.primary, alignItems: "center", justifyContent: "center" },
  name: { marginTop: 10, color: ui.colors.text, fontSize: 19, fontWeight: "900" },
  phone: { marginTop: 4, color: ui.colors.muted, fontSize: 13, fontWeight: "800" },
  row: { marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1, color: ui.colors.text, fontSize: 14, fontWeight: "900" }
});

