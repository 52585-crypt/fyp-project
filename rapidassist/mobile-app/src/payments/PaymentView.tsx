import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Badge, Banner, Button, Card, ErrorState, Header, PriceBreakdown, RadioCard, Screen, SkeletonCard, Text } from "../design/components";
import { tokens } from "../design/tokens";
import { parseRequestId } from "../requests/requestId";
import { formatCurrency, formatDateTime } from "../utils/format";
import { paymentMethodNames, paymentStatusLabel, paymentStatusTone } from "./payments.api";
import { usePayment } from "./usePayment";

type Props = { requestId?: string; role: "user" | "provider"; onDone?: () => void };

/** Bill summary + payment method. Only cash is enabled; online payment is shown as Coming soon. */
export function PaymentView({ requestId, role, onDone }: Props) {
  const p = usePayment(parseRequestId(requestId));
  const customer = role === "user";
  const tone = paymentStatusTone(p.payment) as "success" | "warning" | "danger";

  const footer = p.bundle ? (
    customer && !p.payment ? (
      <Button title={`Pay ${formatCurrency(p.total)} in cash`} icon="cash-outline" loading={p.busy} onPress={p.payCash} />
    ) : !customer && p.payment?.method === "cash" && p.payment.status === "pending" ? (
      <Button title="Confirm cash collected" icon="checkmark-circle" loading={p.busy} onPress={p.confirmCash} />
    ) : onDone ? <Button title="Done" onPress={onDone} /> : null
  ) : null;

  return (
    <Screen header={<Header title={customer ? "Payment" : "Payment & Invoice"} />} footer={footer}
      refreshing={p.loading && Boolean(p.bundle)} onRefresh={p.reload}>
      {p.error ? <Banner tone="danger" message={p.error} /> : null}
      {!p.bundle && p.loading ? <SkeletonCard lines={5} /> : null}
      {!p.bundle && !p.loading ? <ErrorState title="Invoice unavailable" message={p.error} onRetry={p.reload} /> : null}
      {p.bundle ? (
        <>
          <Card>
            <View style={styles.row}>
              <Text variant="bodyStrong" style={styles.flex}>Bill Summary</Text>
              <Text variant="caption" color="muted">{p.bundle.invoice.invoiceNumber}</Text>
            </View>
            <PriceBreakdown lines={p.lines} total={p.total} totalLabel="Total Amount" />
            {!customer ? <Text variant="caption" color="muted">Your earnings after platform fee: {formatCurrency(p.providerEarnings)}</Text> : null}
          </Card>

          <Text variant="headline">Payment Method</Text>
          <RadioCard title="Cash" subtitle={customer ? "Pay to your provider" : "Collect from the customer"} selected={!p.payment || p.payment.method === "cash"} />
          <RadioCard title="Online Payment" subtitle="Card / wallet" tag="Coming soon" selected={false} disabled />

          {p.payment ? (
            <Card>
              <View style={styles.row}>
                <Text variant="bodyStrong" style={styles.flex}>Status</Text>
                <Badge label={paymentStatusLabel(p.payment)} tone={tone} />
              </View>
              <Text variant="caption" color="muted">
                {paymentMethodNames[p.payment.method]}{p.payment.paidAt ? ` • ${formatDateTime(p.payment.paidAt)}` : ""}
              </Text>
              {p.awaitingCash ? (
                <Banner message={customer ? "Hand the cash to your provider. They'll confirm once collected." : "Collect full payment before confirming."} />
              ) : null}
            </Card>
          ) : null}

          <Button title={p.exporting ? "Exporting..." : "Export invoice PDF"} icon="share-outline" variant="outline"
            disabled={p.exporting} onPress={p.exportInvoice} />
          {customer && p.paid ? <Button title="Back to request" variant="ghost" onPress={() => router.back()} /> : null}
          <Text variant="caption" color="muted" align="center">Payments are recorded securely.</Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  flex: { flex: 1 }
});
