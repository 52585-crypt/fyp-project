import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appColors, radii } from "../constants/theme";
import type { ServiceItem } from "../types";

type Props = {
  item: ServiceItem;
  selected?: boolean;
  onPress?: () => void;
};

export function ServiceCard({ item, selected, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={[styles.card, selected ? styles.selected : null]}>
      <View style={[styles.iconWrap, selected ? styles.iconSelected : null]}>
        <Ionicons name={item.icon} size={23} color={selected ? "white" : appColors.primary} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 108,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: appColors.border,
    backgroundColor: appColors.surface,
    padding: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  selected: { borderColor: appColors.primary, backgroundColor: appColors.primarySoft },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: appColors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8
  },
  iconSelected: { backgroundColor: appColors.primary },
  title: { color: appColors.text, fontSize: 12, fontWeight: "900", textAlign: "center" },
  subtitle: { marginTop: 4, color: appColors.muted, fontSize: 10, textAlign: "center" }
});

