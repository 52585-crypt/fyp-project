import React, { useMemo, useState } from "react";
import { Link, router } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { login, loginWithGoogle } from "../../src/auth/auth.api";
import { useAuth } from "../../src/auth/AuthProvider";
import { getGoogleIdToken } from "../../src/auth/googleSignIn";
import { getNetworkErrorMessage } from "../../src/config/api";
import { Field, PrimaryButton, StatusPill } from "../../src/ui/components";
import { ui } from "../../src/ui/system";

export default function Login() {
  const { setSession } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => phone.trim().length >= 10 && password.length >= 6, [phone, password]);

  async function onSubmit() {
    try {
      setLoading(true);
      setError(null);
      const data = await login({ phone: phone.trim(), password });
      await setSession(data.token, data.user);
      router.replace(data.user.role === "mechanic" ? "/(provider)/dashboard" : "/(user)/home");
    } catch (e: any) {
      setError(getNetworkErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleSignIn() {
    if (loading || googleLoading) return;
    try {
      setGoogleLoading(true);
      setError(null);
      const idToken = await getGoogleIdToken();
      if (!idToken) return;
      const data = await loginWithGoogle(idToken);
      await setSession(data.token, data.user);
      router.replace(data.user.phone ? "/(user)/home" : "/(auth)/complete-profile");
    } catch (e: any) {
      setError(getNetworkErrorMessage(e));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <StatusPill label="Secure Login" />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Your next journey starts here. Sign in to continue.</Text>

          <View style={styles.form}>
            <Field label="Phone number" icon="call" placeholder="03001234567" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <Field label="Password" icon="lock-closed" placeholder="Minimum 6 characters" secureTextEntry value={password} onChangeText={setPassword} />
            {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>Use the same account you registered with.</Text>}
            <PrimaryButton title={loading ? "Signing in..." : "Login"} icon="log-in" disabled={!canSubmit || loading || googleLoading} onPress={onSubmit} />
            {Platform.OS !== "web" ? <>
              <View style={styles.separator}><View style={styles.separatorLine} /><Text style={styles.separatorText}>OR</Text><View style={styles.separatorLine} /></View>
              <PrimaryButton title={googleLoading ? "Connecting to Google..." : "Continue with Google"} icon="logo-google" variant="outline" disabled={loading || googleLoading} onPress={onGoogleSignIn} />
            </> : null}
          </View>

          <Text style={styles.bottom}>
            Need an account?{" "}
            <Link href="/(auth)/signup" style={styles.link}>Create one</Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.colors.bg },
  container: { flexGrow: 1, padding: 24, paddingBottom: 56, justifyContent: "center", width: "100%", maxWidth: 520, alignSelf: "center" },
  title: { marginTop: 14, color: ui.colors.text, fontSize: 32, fontWeight: "900" },
  subtitle: { marginTop: 10, color: ui.colors.muted, fontSize: 14, lineHeight: 22, fontWeight: "400" },
  form: { marginTop: 22, gap: 12 },
  hint: { color: ui.colors.muted, fontSize: 12, fontWeight: "700" },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" },
  separator: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  separatorLine: { flex: 1, height: 1, backgroundColor: ui.colors.border },
  separatorText: { color: ui.colors.muted, fontSize: 11, fontWeight: "800" },
  bottom: { marginTop: 18, color: ui.colors.muted, textAlign: "center", fontSize: 13, fontWeight: "700" },
  link: { color: ui.colors.primary, fontWeight: "900" }
});
