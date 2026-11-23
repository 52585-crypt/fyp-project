import { customerRoutes } from "../../../src/navigation/routes";
import React, { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ReviewPromptCard, ReviewSummary } from "../../../src/components/ReviewPromptCard";
import { listMyRequests } from "../../../src/requests/requests.api";
import { getServiceIcon, getServiceTitle } from "../../../src/requests/serviceCatalog";
import type { ServiceRequest } from "../../../src/requests/requests.types";
import { useAuth } from "../../../src/auth/AuthProvider";
import { formatPaymentAmount, listPayments, paymentMethodNames, paymentStatusLabel, paymentStatusTone, type Payment } from "../../../src/payments/payments.api";
import { onReconnected } from "../../../src/services/networkManager";
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
  const { view } = useLocalSearchParams<{ view?: string }>();
  const paymentsOnly = view === "payments";
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [reviewTarget, setReviewTarget] = useState<ServiceRequest | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentCursor, setPaymentCursor] = useState<string | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = useMemo(
    () => requests.filter((request) => request.status === "completed" || request.status === "cancelled"),
    [requests]
  );

  const loadHistory = useCallback(async () => {
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
  }, [token]);

  const loadPayments = useCallback(async (before?: string) => {
    if (!token) return;
    setLoadingPayments(true);
    setPaymentError("");
    try {
      const result = await listPayments(token, before);
      setPayments((existing) => before ? [...existing, ...result.payments] : result.payments);
      setPaymentCursor(result.next);
    } catch {
      setPaymentError("Unable to load payment history. Refresh to try again.");
    } finally {
      setLoadingPayments(false);
    }
  }, [token]);

  const refresh = useCallback(() => {
    if (!paymentsOnly) void loadHistory();
    void loadPayments();
  }, [loadHistory, loadPayments, paymentsOnly]);

  useFocusEffect(useCallback(() => {
    refresh();
    return onReconnected(refresh);
  }, [refresh]));

  return (
    <View style={{ flex: 1 }}>
      <AppShell title={paymentsOnly ? "Payment History" : "Service History"}
        subtitle={paymentsOnly ? undefined : "Completed requests, cancelled requests, and provider reviews."}>
        {!paymentsOnly && token && reviewTarget ? (
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

        <PrimaryButton title={loading ? "Refreshing..." : "Refresh History"} icon="refresh" variant="outline" disabled={loading || loadingPayments} onPress={refresh} />
        {!paymentsOnly && error ? <Text style={styles.error}>{error}</Text> : null}

        {!paymentsOnly && history.length === 0 ? (
          <Card style={styles.empty}>
            <IconBox icon="receipt" />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>No completed requests yet</Text>
              <Text style={styles.subtitle}>Completed and cancelled services will appear here.</Text>
            </View>
          </Card>
        ) : null}

        {!paymentsOnly && history.map((request) => (
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
            {request.status === "completed" ? (
              <PrimaryButton title="View Invoice" icon="receipt" variant="outline"
                onPress={() => router.push(customerRoutes.pay(request.id))} />
            ) : null}
            {canReview(request) ? (
              <PrimaryButton title="Review Provider" icon="star" variant="success" onPress={() => setReviewTarget(request)} />
            ) : null}
          </Card>
        ))}
        <Card style={styles.row}>
          {!paymentsOnly ? <Text style={styles.title}>Payment History</Text> : null}
          {paymentError ? <Text style={styles.error}>{paymentError}</Text> : null}
          {loadingPayments && !payments.length ? <Text style={styles.subtitle}>Loading payments…</Text> : null}
          {!loadingPayments && !paymentError && !payments.length ? <Text style={styles.subtitle}>No payments yet.</Text> : null}
          {payments.map((payment) => (
            <View key={payment.id} style={styles.row}>
              <View style={styles.top}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{formatPaymentAmount(payment.amountMinor, payment.currency)}</Text>
                  <Text style={styles.subtitle}>{paymentMethodNames[payment.method]} · {new Date(payment.paidAt || payment.createdAt).toLocaleString()}</Text>
                </View>
                <StatusPill label={paymentStatusLabel(payment)} tone={paymentStatusTone(payment)} />
              </View>
              <PrimaryButton title="Payment Details" icon="receipt" variant="outline"
                onPress={() => router.push(customerRoutes.pay(payment.requestId))} />
            </View>
          ))}
          {paymentCursor ? <PrimaryButton title="Load Earlier Payments" variant="outline" disabled={loadingPayments}
            onPress={() => void loadPayments(paymentCursor)} /> : null}
        </Card>
      </AppShell>
      <BottomNav role="user" active="Activity" />
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
