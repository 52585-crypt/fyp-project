import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../src/auth/AuthProvider";
import { AccountModeAction } from "../../../src/auth/AccountModeAction";
import { AppShell, BottomNav, Card, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";
import { useVerification } from "../../../src/verification/VerificationProvider";
import { verificationPresentation } from "../../../src/verification/verification";

function ProviderAvatar({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.avatar}>
      {url && !failed
        ? <Image accessibilityLabel="Account avatar" source={{ uri: url }} style={styles.avatarImage} onError={() => setFailed(true)} />
        : <Ionicons name="construct" size={32} color="white" />}
    </View>
  );
}

export default function ProviderProfile() {
  const { user, logout } = useAuth();
  const { status, error: statusError } = useVerification();
  const verification = status && !statusError ? verificationPresentation(status) : null;

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
      <AppShell title="Provider Profile" subtitle="Service category, verification, and documents.">
        <Card style={styles.profile}>
          <ProviderAvatar key={user?.profilePictureUrl || "default"} url={user?.profilePictureUrl} />
          <Text style={styles.name}>{user?.name || "Provider"}</Text>
          <Text style={styles.phone}>{user?.phone || "0300 0000000"}</Text>
          <StatusPill label={verification?.title || "Check verification"} tone={verification?.tone || "accent"} />
        </Card>
        <AccountModeAction />

        {["Service category", "Verification documents", "Workshop information", "Support"].map((item) => {
          const row = (
            <Card style={styles.row}>
              <IconBox icon={item === "Service category" ? "construct" : item === "Verification documents" ? "shield-checkmark" : item === "Workshop information" ? "business" : "headset"} />
              <Text style={styles.rowText}>{item}</Text>
              <Ionicons name="chevron-forward" size={18} color={ui.colors.muted} />
            </Card>
          );
          return item === "Verification documents" ? (
            <Pressable key={item} accessibilityRole="button" onPress={() => router.push("/(provider)/verification")}>
              {row}
            </Pressable>
          ) : <React.Fragment key={item}>{row}</React.Fragment>;
        })}

        {error ? <Text accessibilityRole="alert" style={{ color: ui.colors.danger, marginBottom: 12 }}>{error}</Text> : null}
        <PrimaryButton title={signingOut ? "Signing out…" : "Logout"} disabled={signingOut} icon="log-out" variant="outline" onPress={onLogout} />
      </AppShell>
      <BottomNav role="provider" active="Profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: "center", gap: 7, marginBottom: 12 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: ui.colors.dark, alignItems: "center", justifyContent: "center" },
  avatarImage: { width: 76, height: 76, borderRadius: 38 },
  name: { color: ui.colors.text, fontSize: 19, fontWeight: "900" },
  phone: { color: ui.colors.muted, fontSize: 13, fontWeight: "800" },
  row: { marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1, color: ui.colors.text, fontSize: 14, fontWeight: "900" }
});

