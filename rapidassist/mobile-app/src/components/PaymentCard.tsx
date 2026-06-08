import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appColors, radii } from "../constants/theme";
import type { PaymentMethod } from "../types";

type Props = {
  method: PaymentMethod;
  selected: boolean;
  onPress: () => void;
};

export function PaymentCard({ method, selected, onPress }: Props) {
  const label = method === "cash" ? "Cash" : "Online Payment";
  const detail = method === "cash" ? "Pay to driver/mechanic" : "Pay using card or wallet";
  return (
    <Pressable onPress={onPress} style={[styles.card, selected ? styles.selected : null]}>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={appColors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.md, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  selected: { borderColor: appColors.primary },
  label: { color: appColors.text, fontSize: 14, fontWeight: "900" },
  detail: { marginTop: 2, color: appColors.muted, fontSize: 12 }
});

