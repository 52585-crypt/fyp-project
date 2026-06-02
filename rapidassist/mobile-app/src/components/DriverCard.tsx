import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appColors, radii } from "../constants/theme";
import type { ProviderProfile } from "../types";

type Props = {
  driver: ProviderProfile;
  onCall?: () => void;
  onChat?: () => void;
};

export function DriverCard({ driver, onCall, onChat }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={24} color="white" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{driver.name}</Text>
        <Text style={styles.meta}>{driver.vehicle}</Text>
        <Text style={styles.rating}>Rating {driver.rating} - {driver.plateNumber}</Text>
      </View>
      <Pressable onPress={onCall} style={styles.action}><Ionicons name="call" size={18} color={appColors.primary} /></Pressable>
      <Pressable onPress={onChat} style={styles.action}><Ionicons name="chatbubble" size={18} color={appColors.primary} /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: appColors.surface,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: appColors.primary, alignItems: "center", justifyContent: "center" },
  name: { color: appColors.text, fontSize: 15, fontWeight: "900" },
  meta: { marginTop: 2, color: appColors.muted, fontSize: 12, fontWeight: "700" },
  rating: { marginTop: 3, color: appColors.warning, fontSize: 12, fontWeight: "900" },
  action: { width: 36, height: 36, borderRadius: 18, backgroundColor: appColors.primarySoft, alignItems: "center", justifyContent: "center" }
});
