import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export type LocationTarget = "pickup" | "destination";

export function TargetSwitch({
  activeTarget,
  onActiveTargetChange
}: {
  activeTarget: LocationTarget;
  onActiveTargetChange: (target: LocationTarget) => void;
}) {
  return (
    <View style={styles.switch}>
      <TargetButton
        label="Pickup"
        icon="locate"
        active={activeTarget === "pickup"}
        onPress={() => onActiveTargetChange("pickup")}
      />
      <TargetButton
        label="Destination"
        icon="flag"
        active={activeTarget === "destination"}
        onPress={() => onActiveTargetChange("destination")}
      />
    </View>
  );
}

function TargetButton({
  label,
  icon,
  active,
  onPress
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.targetButton, active ? styles.targetButtonActive : null]}>
      <Ionicons name={icon} size={16} color={active ? "white" : colors.primaryDark} />
      <Text style={[styles.targetText, active ? styles.targetTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switch: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    flexDirection: "row",
    padding: 4
  },
  targetButton: {
    flex: 1,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7
  },
  targetButtonActive: { backgroundColor: colors.primary },
  targetText: { color: colors.primaryDark, fontSize: 12, fontWeight: "900" },
  targetTextActive: { color: "white" }
});
