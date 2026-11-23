import React, { useMemo, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { completeGooglePhone } from "../../src/auth/auth.api";
import { resumeAfterSignIn } from "../../src/auth/customerNavigation";
import { useAuth } from "../../src/auth/AuthProvider";
import { getNetworkErrorMessage } from "../../src/config/api";
import { Field, PrimaryButton, StatusPill } from "../../src/ui/components";
import { ui } from "../../src/ui/system";

export default function CompleteProfile() {
  const { token, user, updateUser, logout } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = useMemo(() => phone.trim().length >= 10, [phone]);

  if (!token || !user) return <Redirect href={{ pathname: "/(auth)/login", params: { returnTo } }} />;
  if (user.role !== "user") return <Redirect href="/" />;
  if (user.phone) return <Redirect href={resumeAfterSignIn(user, returnTo) ?? "/home"} />;

  async function onSave() {
    if (!token || saving) return;
    try {
      setSaving(true);
      setError(null);
      const result = await completeGooglePhone(token, phone.trim());
      updateUser(result.user);
      router.replace(resumeAfterSignIn(result.user, returnTo) ?? "/home");
    } catch (e: any) {
      setError(getNetworkErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSignOut() {
    try {
      setSigningOut(true);
      setError(null);
      await logout();
      router.replace("/(auth)/welcome");
    } catch (e: any) {
      setError(getNetworkErrorMessage(e));
    } finally {
      setSigningOut(false);
    }
  }

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <StatusPill label="ONE LAST STEP" />
        <Text style={styles.title}>Complete your profile</Text>
        <Text style={styles.subtitle}>Add a phone number so your roadside provider can reach you when needed.</Text>
        <View style={styles.form}>
          <Field label="Phone number" icon="call" placeholder="03001234567" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <PrimaryButton title={saving ? "Saving..." : "Continue"} icon="arrow-forward" disabled={!canSave || saving || signingOut} onPress={onSave} />
          <PrimaryButton title={signingOut ? "Signing out..." : "Sign out"} variant="outline" disabled={saving || signingOut} onPress={onSignOut} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.colors.bg },
  container: { flexGrow: 1, padding: 24, justifyContent: "center", width: "100%", maxWidth: 520, alignSelf: "center" },
  title: { marginTop: 14, color: ui.colors.text, fontSize: 30, fontWeight: "900" },
  subtitle: { marginTop: 10, color: ui.colors.muted, fontSize: 14, lineHeight: 22 },
  form: { marginTop: 26, gap: 14 },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "700" }
});
