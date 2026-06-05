import React, { useMemo, useState } from "react";
import { Link, router } from "expo-router";
import { KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { login } from "../../src/auth/auth.api";
import { useAuth } from "../../src/auth/AuthProvider";
import { getNetworkErrorMessage } from "../../src/config/api";
import { Field, PrimaryButton, StatusPill } from "../../src/ui/components";
import { ui } from "../../src/ui/system";

export default function Login() {
  const { setSession } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <StatusPill label="Secure Login" />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in as a user or provider. Your role decides the dashboard.</Text>

          <View style={styles.form}>
            <Field label="Phone number" icon="call" placeholder="03001234567" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <Field label="Password" icon="lock-closed" placeholder="Minimum 6 characters" secureTextEntry value={password} onChangeText={setPassword} />
            {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>Use the same account you registered with.</Text>}
            <PrimaryButton title={loading ? "Signing in..." : "Login"} icon="log-in" disabled={!canSubmit || loading} onPress={onSubmit} />
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
  container: { flexGrow: 1, padding: 18, paddingBottom: 56, justifyContent: "center" },
  title: { marginTop: 14, color: ui.colors.text, fontSize: 32, fontWeight: "900" },
  subtitle: { marginTop: 8, color: ui.colors.muted, fontSize: 14, lineHeight: 21, fontWeight: "700" },
  form: { marginTop: 22, gap: 12 },
  hint: { color: ui.colors.muted, fontSize: 12, fontWeight: "700" },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800" },
  bottom: { marginTop: 18, color: ui.colors.muted, textAlign: "center", fontSize: 13, fontWeight: "700" },
  link: { color: ui.colors.primary, fontWeight: "900" }
});

