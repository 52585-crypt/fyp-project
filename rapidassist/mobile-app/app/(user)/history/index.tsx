import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ReviewPromptCard, ReviewSummary } from "../../../src/components/ReviewPromptCard";
import { listMyRequests } from "../../../src/requests/requests.api";
import { getServiceIcon, getServiceTitle } from "../../../src/requests/serviceCatalog";
import type { ServiceRequest } from "../../../src/requests/requests.types";
import { useAuth } from "../../../src/auth/AuthProvider";
import { AppShell, BottomNav, Card, IconBox, PrimaryButton, StatusPill } from "../../../src/ui/components";
import { ui } from "../../../src/ui/system";

function statusTone(status: ServiceRequest["status"]) {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  return "warning";
}

function canReview(request: ServiceRequest) {
  return request.status === "completed" && Boolean(request.providerId) && !request.review?.rating;
}

export default function UserHistory() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [reviewTarget, setReviewTarget] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = useMemo(
    () => requests.filter((request) => request.status === "completed" || request.status === "cancelled"),
    [requests]
  );

  async function loadHistory() {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      setRequests(await listMyRequests(token));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, [token]);

  return (
    <View style={{ flex: 1 }}>
      <AppShell title="Service History" subtitle="Completed requests, cancelled requests, and provider reviews.">
        {token && reviewTarget ? (
          <ReviewPromptCard
            token={token}
            request={reviewTarget}
            onSubmitted={(updated) => {
              setReviewTarget(null);
              setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            }}
            onLater={() => setReviewTarget(null)}
          />
        ) : null}

        <PrimaryButton title={loading ? "Refreshing..." : "Refresh History"} icon="refresh" variant="outline" disabled={loading} onPress={loadHistory} />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {history.length === 0 ? (
          <Card style={styles.empty}>
            <IconBox icon="receipt" />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>No completed requests yet</Text>
              <Text style={styles.subtitle}>Completed and cancelled services will appear here.</Text>
            </View>
          </Card>
        ) : null}

        {history.map((request) => (
          <Card key={request.id} style={styles.row}>
            <View style={styles.top}>
              <IconBox icon={getServiceIcon(request.category)} tone={request.status === "cancelled" ? "danger" : "success"} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{getServiceTitle(request.category)}</Text>
                <Text style={styles.subtitle}>
                  PKR {request.estimate?.total?.toLocaleString() || 0} - {request.pickupLocation?.addressText || "Pickup location"}
                </Text>
                <Text style={styles.date}>{new Date(request.updatedAt).toLocaleString()}</Text>
                <ReviewSummary request={request} />
              </View>
              <StatusPill label={request.status.replaceAll("_", " ")} tone={statusTone(request.status)} />
            </View>
            {canReview(request) ? (
              <PrimaryButton title="Review Provider" icon="star" variant="success" onPress={() => setReviewTarget(request)} />
            ) : null}
          </Card>
        ))}
      </AppShell>
      <BottomNav role="user" active="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  row: { gap: 12, marginTop: 10 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: ui.colors.text, fontSize: 15, fontWeight: "900" },
  subtitle: { marginTop: 3, color: ui.colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  date: { marginTop: 3, color: ui.colors.primary, fontSize: 11, fontWeight: "800" },
  error: { marginTop: 10, color: ui.colors.danger, fontSize: 12, fontWeight: "800" }
});
