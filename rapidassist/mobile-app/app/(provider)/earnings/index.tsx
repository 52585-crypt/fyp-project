import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppShell, BottomNav, Card, IconBox, Metric, StatusPill } from "../../../src/ui/components";
import { useAuth } from "../../../src/auth/AuthProvider";
import { getProviderEarnings } from "../../../src/requests/requests.api";
import type { ProviderEarnings } from "../../../src/requests/requests.types";
import { ui } from "../../../src/ui/system";

export default function ProviderEarnings() {
  const { token } = useAuth();
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!token) return;
      try {
        setEarnings(await getProviderEarnings(token));
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || "Failed to load earnings");
      }
    }
    load();
  }, [token]);

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Earnings" subtitle="Track completed jobs and payout summary.">
        <View style={styles.metrics}>
          <Metric label="Today" value={`PKR ${earnings?.today?.toLocaleString() || 0}`} icon="cash" />
          <Metric label="This week" value={`PKR ${earnings?.week?.toLocaleString() || 0}`} icon="trending-up" />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {(earnings?.recent || []).map((request) => (
          <Card key={request.id} style={styles.row}>
            <IconBox icon="receipt" />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{request.category.replace("_", " ").toUpperCase()}</Text>
              <Text style={styles.meta}>{request.pickupLocation?.addressText || "Completed job"}</Text>
            </View>
            <StatusPill label={`PKR ${request.estimate?.total?.toLocaleString() || 0}`} tone="success" />
          </Card>
        ))}
        {!earnings?.recent?.length ? (
          <Card style={styles.row}>
            <IconBox icon="receipt" />
            <Text style={styles.title}>No completed jobs yet</Text>
          </Card>
        ) : null}
      </AppShell>
      <BottomNav role="provider" active="Earn" />
    </View>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", gap: 12, marginBottom: 14 },
  row: { marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: ui.colors.text, fontSize: 14, fontWeight: "900" },
  meta: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700" },
  error: { color: ui.colors.danger, fontSize: 12, fontWeight: "800", marginBottom: 10 }
});
