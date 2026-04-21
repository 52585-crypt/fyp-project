import React, { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme/colors";
import { RATextInput } from "../../src/components/RATextInput";
import { RAButton } from "../../src/components/RAButton";
import { login } from "../../src/auth/auth.api";
import { useAuth } from "../../src/auth/AuthProvider";

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
      router.replace("/(app)/home");
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        "Login failed (check API_BASE_URL and backend)";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="log-in" size={24} color={colors.primary} />
          <Text style={styles.title}>Login</Text>
          <Text style={styles.subtitle}>Sign in to request help or manage jobs</Text>
        </View>

        <View style={styles.form}>
          <RATextInput
            icon="call"
            placeholder="Phone (e.g. 03001234567)"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <View style={{ height: 12 }} />
          <RATextInput
            icon="lock-closed"
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <Text style={styles.hint}>Tip: Use the same phone/password you registered.</Text>
          )}

          <View style={{ height: 14 }} />
          <RAButton title={loading ? "Please wait..." : "Login"} disabled={!canSubmit || loading} onPress={onSubmit} />

          <View style={{ height: 14 }} />
          <Text style={styles.bottom}>
            Don’t have an account?{" "}
            <Link href="/(auth)/signup" style={styles.link}>
              Create one
            </Link>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 18 },
  header: { paddingTop: 16, paddingBottom: 18 },
  title: { marginTop: 10, fontSize: 28, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 6, fontSize: 14, color: colors.mutedText },
  form: {
    marginTop: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 16
  },
  hint: { marginTop: 10, color: colors.mutedText, fontSize: 12 },
  error: { marginTop: 10, color: colors.danger, fontSize: 12, fontWeight: "600" },
  bottom: { marginTop: 12, textAlign: "center", color: colors.mutedText },
  link: { color: colors.primary, fontWeight: "700" }
});

