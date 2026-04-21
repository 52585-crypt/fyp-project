import React, { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme/colors";
import { RATextInput } from "../../src/components/RATextInput";
import { RAButton } from "../../src/components/RAButton";
import { register } from "../../src/auth/auth.api";
import { useAuth } from "../../src/auth/AuthProvider";
import type { UserRole } from "../../src/auth/auth.types";

function RolePill({ role, selected }: { role: UserRole; selected: boolean }) {
  return (
    <View style={[styles.pillWrap, selected ? styles.pillWrapSelected : null]}>
      <Text style={[styles.pillText, selected ? styles.pillTextSelected : null]}>
        {role === "user" ? "User" : "Mechanic"}
      </Text>
    </View>
  );
}

export default function Signup() {
  const { setSession } = useAuth();
  const [role, setRole] = useState<UserRole>("user");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && phone.trim().length >= 10 && password.length >= 6;
  }, [name, phone, password]);

  async function onSubmit() {
    try {
      setLoading(true);
      setError(null);
      const data = await register({ role, name: name.trim(), phone: phone.trim(), password });
      await setSession(data.token, data.user);
      router.replace("/(app)/home");
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        "Signup failed (check API_BASE_URL and backend)";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="person-add" size={24} color={colors.primary} />
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Choose your role and continue</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Role</Text>
          <View style={styles.pills}>
            <Text onPress={() => setRole("user")} style={styles.pillPressTarget}>
              <RolePill role="user" selected={role === "user"} />
            </Text>
            <Text onPress={() => setRole("mechanic")} style={styles.pillPressTarget}>
              <RolePill role="mechanic" selected={role === "mechanic"} />
            </Text>
          </View>

          <View style={{ height: 12 }} />
          <RATextInput icon="person" placeholder="Full name" value={name} onChangeText={setName} />
          <View style={{ height: 12 }} />
          <RATextInput
            icon="call"
            placeholder="Phone (e.g. 03001234567)"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <View style={{ height: 12 }} />
          <RATextInput icon="lock-closed" placeholder="Password (min 6 chars)" secureTextEntry value={password} onChangeText={setPassword} />

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <Text style={styles.hint}>Mechanics can add certificate later in verification.</Text>
          )}

          <View style={{ height: 14 }} />
          <RAButton title={loading ? "Please wait..." : "Create account"} disabled={!canSubmit || loading} onPress={onSubmit} />

          <View style={{ height: 14 }} />
          <Text style={styles.bottom}>
            Already have an account?{" "}
            <Link href="/(auth)/login" style={styles.link}>
              Login
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
  label: { fontSize: 12, color: colors.mutedText, fontWeight: "700", marginBottom: 8 },
  pills: { flexDirection: "row", gap: 10 },
  pillPressTarget: { flex: 1 },
  pillWrap: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: "center"
  },
  pillWrapSelected: { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" },
  pillText: { color: colors.text, fontWeight: "700" },
  pillTextSelected: { color: colors.primaryDark },
  hint: { marginTop: 10, color: colors.mutedText, fontSize: 12 },
  error: { marginTop: 10, color: colors.danger, fontSize: 12, fontWeight: "600" },
  bottom: { marginTop: 12, textAlign: "center", color: colors.mutedText },
  link: { color: colors.primary, fontWeight: "700" }
});

