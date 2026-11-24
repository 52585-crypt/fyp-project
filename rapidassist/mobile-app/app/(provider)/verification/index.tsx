import React, { useEffect, useState } from "react";
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

const STATUS_COPY = {
  verified: {
    title: "You're verified",
    tone: "success" as const,
    pill: "Verified",
    text: () => "Your documents were approved. You can go online and accept jobs."
  },
  rejected: {
    title: "Documents not approved",
    tone: "danger" as const,
    pill: "Rejected",
    text: () => "Please fix the issue below and upload your documents again."
  },
  pending: {
    title: "Manual review pending",
    tone: "warning" as const,
    pill: "Pending",
    text: (label: string) => `Your ${label} documents are saved and waiting for admin approval. You can't accept jobs until they're approved.`
  }
};

export default function ProviderVerification() {
  const { user, refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const serviceCategory = user?.mechanicProfile?.serviceCategory;
  const docs = docsFor(serviceCategory);
  const status = user?.verificationStatus === "verified" || user?.verificationStatus === "rejected" ? user.verificationStatus : "pending";
  const copy = STATUS_COPY[status];

  async function checkAgain() {
    try {
      setRefreshing(true);
      await refreshUser();
    } catch {
      // keep showing the last known status
    } finally {
      setRefreshing(false);
    }
  }

  // Pick up a decision the admin made since the app was opened.
  useEffect(() => {
    checkAgain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell title="Verification" subtitle="Provider identity and service documents.">
      <Card style={styles.summary}>
        <IconBox icon="shield-checkmark" tone={copy.tone} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.text}>{copy.text(providerLabel(serviceCategory).toLowerCase())}</Text>
        </View>
        <StatusPill label={copy.pill} tone={copy.tone} />
      </Card>

      {user?.verificationNote && status !== "verified" ? (
        <Card style={status === "rejected" ? styles.noteDanger : styles.note}>
          <Text style={[styles.noteLabel, status === "rejected" ? { color: ui.colors.danger } : null]}>
            {status === "rejected" ? "Reason from RapidAssist" : "Note from RapidAssist"}
          </Text>
          <Text style={styles.noteText}>{user.verificationNote}</Text>
        </Card>
      ) : null}

      {docs.map((item) => (
        <Card key={item.label} style={styles.row}>
          <IconBox icon={item.icon} tone={item.label === "Driving licence" ? "primary" : "success"} />
          <Text style={styles.doc}>{item.label}</Text>
          <StatusPill
            label={status === "verified" ? "Approved" : status === "rejected" ? "Check" : "Saved"}
            tone={status === "verified" ? "success" : status === "rejected" ? "warning" : "success"}
          />
        </Card>
      ))}
      <PrimaryButton
        title={refreshing ? "Checking..." : "Check Status Again"}
        icon="refresh"
        variant="outline"
        disabled={refreshing}
        onPress={checkAgain}
      />
      <PrimaryButton title="Update Documents" variant={status === "rejected" ? "primary" : "outline"} style={{ marginTop: 10 }} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  title: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  text: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  row: { marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  doc: { flex: 1, color: ui.colors.text, fontSize: 14, fontWeight: "900" },
  note: { marginBottom: 12, gap: 4 },
  noteDanger: { marginBottom: 12, gap: 4, borderColor: ui.colors.danger, backgroundColor: ui.colors.dangerSoft },
  noteLabel: { color: ui.colors.primary, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  noteText: { color: ui.colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 }
});
