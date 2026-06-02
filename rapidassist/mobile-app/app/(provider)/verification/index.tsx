import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppShell, Card, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

const docs = ["Real-time selfie", "ID card front", "ID card back", "Workshop photo", "Certificate"];

export default function ProviderVerification() {
  return (
    <AppShell title="Verification" subtitle="Provider identity and service documents.">
      <Card style={styles.summary}>
        <IconBox icon="shield-checkmark" tone="warning" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Manual review pending</Text>
          <Text style={styles.text}>Your documents are saved and waiting for admin approval.</Text>
        </View>
        <StatusPill label="Pending" tone="warning" />
      </Card>
      {docs.map((item, index) => (
        <Card key={item} style={styles.row}>
          <IconBox icon={index === 4 ? "document-text" : "image"} tone={index === 4 ? "primary" : "success"} />
          <Text style={styles.doc}>{item}</Text>
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

