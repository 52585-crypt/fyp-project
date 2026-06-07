import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../../src/auth/AuthProvider";
import { AppShell, Card, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

function docsFor(category?: string | null) {
  const baseDocs = [
    { label: "Real-time selfie", icon: "person-circle" as const },
    { label: "ID card front", icon: "card" as const },
    { label: "ID card back", icon: "card" as const }
  ];

  if (category === "mechanic") {
    return [
      ...baseDocs,
      { label: "Workshop photo", icon: "business" as const },
      { label: "Certificate", icon: "document-text" as const }
    ];
  }

  return [...baseDocs, { label: "Driving licence", icon: "card" as const }];
}

function providerLabel(category?: string | null) {
  if (category === "fuel_delivery") return "Fuel delivery rider";
  if (category === "towing") return "Towing driver";
  return "Mechanic";
}

export default function ProviderVerification() {
  const { user } = useAuth();
  const serviceCategory = user?.mechanicProfile?.serviceCategory;
  const docs = docsFor(serviceCategory);

  return (
    <AppShell title="Verification" subtitle="Provider identity and service documents.">
      <Card style={styles.summary}>
        <IconBox icon="shield-checkmark" tone="warning" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Manual review pending</Text>
          <Text style={styles.text}>
            Your {providerLabel(serviceCategory).toLowerCase()} documents are saved and waiting for admin approval.
          </Text>
        </View>
        <StatusPill label="Pending" tone="warning" />
      </Card>
      {docs.map((item) => (
        <Card key={item.label} style={styles.row}>
          <IconBox icon={item.icon} tone={item.label === "Driving licence" ? "primary" : "success"} />
          <Text style={styles.doc}>{item.label}</Text>
          <StatusPill label="Saved" tone="success" />
        </Card>
      ))}
      <PrimaryButton title="Update Documents" variant="outline" />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  title: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  text: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  row: { marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  doc: { flex: 1, color: ui.colors.text, fontSize: 14, fontWeight: "900" }
});
