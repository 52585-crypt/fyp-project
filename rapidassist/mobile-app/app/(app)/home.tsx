import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme/colors";
import { RAButton } from "../../src/components/RAButton";
import { useAuth } from "../../src/auth/AuthProvider";

export default function Home() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={18} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Welcome</Text>
              <Text style={styles.subtitle}>
                {user?.name} • {user?.role}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 12 }} />

        <RAButton title="Logout" onPress={logout} style={{ backgroundColor: colors.text }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 18 },
  card: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16
  },
  row: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 2, fontSize: 13, color: colors.mutedText }
});

