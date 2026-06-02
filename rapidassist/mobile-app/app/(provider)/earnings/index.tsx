import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppShell, BottomNav, Card, IconBox, Metric, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const payouts = [
  ["Towing job", "PKR 2,788", "Today"],
  ["Mechanic inspection", "PKR 1,250", "Today"],
  ["Fuel delivery", "PKR 900", "Yesterday"]
];

export default function ProviderEarnings() {
  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Earnings" subtitle="Track completed jobs and payout summary.">
        <View style={styles.metrics}>
          <Metric label="Today" value="PKR 8.4k" icon="cash" />
          <Metric label="This week" value="PKR 31k" icon="trending-up" />
        </View>
        {payouts.map(([title, amount, day]) => (
          <Card key={title} style={styles.row}>
            <IconBox icon="receipt" />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.meta}>{day}</Text>
            </View>
            <StatusPill label={amount} tone="success" />
          </Card>
        ))}
      </AppShell>
      <BottomNav role="provider" active="Earn" />
    </View>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", gap: 12, marginBottom: 14 },
  row: { marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: ui.colors.text, fontSize: 14, fontWeight: "900" },
  meta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700" }
});

