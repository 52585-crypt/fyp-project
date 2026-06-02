import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppShell, BottomNav, Card, IconBox, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const history = [
  ["Car Towing", "Completed - PKR 2,788", "success"],
  ["Mechanic", "Paid - PKR 1,250", "success"],
  ["Fuel Delivery", "Cancelled", "danger"]
] as const;

export default function UserHistory() {
  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Service History" subtitle="Your previous roadside assistance requests.">
        {history.map(([title, subtitle, tone]) => (
          <Card key={title} style={styles.row}>
            <IconBox icon="receipt" tone={tone === "danger" ? "danger" : "success"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <StatusPill label={tone === "danger" ? "Cancelled" : "Done"} tone={tone} />
          </Card>
        ))}
      </AppShell>
      <BottomNav role="user" active="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  title: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  subtitle: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700" }
});

