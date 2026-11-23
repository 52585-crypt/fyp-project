import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, Button, Card, ChipGroup, EmptyState, ErrorState, Header, Screen, SkeletonCard, Text } from "../../../src/design/components";
import { tokens } from "../../../src/design/tokens";
import { customerRoutes } from "../../../src/navigation/routes";
import { formatPaymentAmount, paymentMethodNames, paymentStatusLabel, paymentStatusTone } from "../../../src/payments/payments.api";
import { usePaymentHistory } from "../../../src/payments/usePaymentHistory";
import { RequestCard } from "../../../src/requests/customer/RequestCard";
import { useMyRequests } from "../../../src/requests/useMyRequests";
import { formatDateTime } from "../../../src/utils/format";

type Segment = "active" | "history" | "payments";
const segments = [{ value: "active", label: "Active" }, { value: "history", label: "History" }, { value: "payments", label: "Payments" }] as const;

export default function RequestsTab() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const [segment, setSegment] = useState<Segment>(view === "payments" ? "payments" : "active");
  const mine = useMyRequests();
  const pay = usePaymentHistory();
  useFocusEffect(useCallback(() => { if (segment === "payments") pay.reload(); }, [segment])); // eslint-disable-line react-hooks/exhaustive-deps

  const list = segment === "active" ? mine.active : mine.history;
  return (
    <Screen edges={["top", "left", "right"]} header={<Header title="My Requests" back={false} />}
      refreshing={mine.refreshing || pay.loading} onRefresh={segment === "payments" ? pay.reload : mine.refresh}>
      <ChipGroup columns={3} options={segments} value={segment} onChange={setSegment} accessibilityLabel="Request filter" />

      {segment !== "payments" ? (
        <>
          {mine.loading ? <><SkeletonCard lines={1} /><SkeletonCard lines={1} /></> : null}
          {mine.error && !mine.requests ? <ErrorState message={mine.error} onRetry={mine.refresh} /> : null}
          {mine.requests && list.length === 0 ? (
            segment === "active"
              ? <EmptyState icon="car-outline" title="No active requests" message="Book towing, fuel or a mechanic from Home." actionLabel="Book a service" onAction={() => router.push(customerRoutes.home)} />
              : <EmptyState icon="time-outline" title="No past requests" message="Completed and cancelled requests appear here." />
          ) : null}
          {list.map((r) => (
            <RequestCard key={r.id} request={r} footer={
              r.status === "completed" && r.providerId && !r.review?.rating ? (
                <Button title="Rate your experience" icon="star-outline" variant="secondary" size="small" onPress={() => router.push(customerRoutes.review(r.id))} />
              ) : null
            } />
          ))}
        </>
      ) : (
        <>
          {pay.error ? <ErrorState message={pay.error} onRetry={pay.reload} /> : null}
          {!pay.error && !pay.loading && pay.payments.length === 0 ? (
            <EmptyState icon="receipt-outline" title="No payments yet" message="Payments for completed jobs appear here." />
          ) : null}
          {pay.payments.map((p) => (
            <Card key={p.id} onPress={() => router.push(customerRoutes.pay(p.requestId))} accessibilityLabel={`Payment ${formatPaymentAmount(p.amountMinor, p.currency)}`}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{formatPaymentAmount(p.amountMinor, p.currency)}</Text>
                  <Text variant="caption" color="muted">{paymentMethodNames[p.method]} • {formatDateTime(p.paidAt ?? p.createdAt)}</Text>
                </View>
                <Badge label={paymentStatusLabel(p)} tone={paymentStatusTone(p) as "success" | "warning" | "danger"} />
              </View>
            </Card>
          ))}
          {pay.hasMore ? <Button title="Load more" variant="outline" loading={pay.loading} onPress={() => void pay.loadMore()} /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.md },
  flex: { flex: 1, gap: tokens.space.xxs }
});
