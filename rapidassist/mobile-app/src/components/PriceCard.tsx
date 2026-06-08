import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { appColors, radii } from "../constants/theme";
import type { PriceLine } from "../types";
import { formatCurrency } from "../utils/format";

type Props = {
  lines: PriceLine[];
  title?: string;
};

export function PriceCard({ lines, title = "Bill Summary" }: Props) {
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {lines.map((line) => (
        <View key={line.label} style={styles.row}>
          <Text style={styles.label}>{line.label}</Text>
          <Text style={styles.value}>{formatCurrency(line.amount)}</Text>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total Amount</Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: 1, borderColor: appColors.border, backgroundColor: appColors.surface, padding: 14 },
  title: { color: appColors.text, fontSize: 15, fontWeight: "900", marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  label: { color: appColors.text, fontSize: 13, fontWeight: "700" },
  value: { color: appColors.text, fontSize: 13, fontWeight: "800" },
  totalRow: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: appColors.border, flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: appColors.text, fontSize: 14, fontWeight: "900" },
  totalValue: { color: appColors.primary, fontSize: 18, fontWeight: "900" }
});

