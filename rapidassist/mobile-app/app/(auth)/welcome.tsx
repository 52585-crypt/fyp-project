import React from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme/colors";
import { RAButton } from "../../src/components/RAButton";

export default function Welcome() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Ionicons name="car-sport" size={28} color="white" />
          </View>
          <Text style={styles.title}>RapidAssist</Text>
          <Text style={styles.subtitle}>Roadside help in seconds</Text>
        </View>

        <View style={styles.card}>
          <Link href="/(auth)/login" asChild>
            <RAButton title="Login" />
          </Link>
          <View style={{ height: 12 }} />
          <Link href="/(auth)/signup" asChild>
            <RAButton title="Create account" style={{ backgroundColor: colors.text }} />
          </Link>
        </View>

        <Text style={styles.footer}>
          Simple pricing. No gateway. Cash-based confirmation.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 18, justifyContent: "space-between" },
  hero: { paddingTop: 28, alignItems: "center" },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2
  },
  title: { marginTop: 14, fontSize: 30, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 6, fontSize: 15, color: colors.mutedText },
  card: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16
  },
  footer: { textAlign: "center", color: colors.mutedText, fontSize: 12, paddingBottom: 10 }
});

