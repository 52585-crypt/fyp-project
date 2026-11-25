import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, Banner, Button, Card, ErrorState, Header, PriceBreakdown, RadioCard, Screen, SkeletonCard, Text } from "../design/components";
import { tokens } from "../design/tokens";
import { parseRequestId } from "../requests/requestId";
import { formatCurrency, formatDateTime } from "../utils/format";
import { paymentMethodNames, paymentStatusLabel, paymentStatusTone } from "./payments.api";
import { StripeCheckout } from "./StripeCheckout";
import { usePayment } from "./usePayment";

type Props = { requestId?: string; role: "user" | "provider"; onDone?: () => void };

/** Bill summary + payment method: cash, or an online card payment through Stripe (test mode). */
export function PaymentView({ requestId, role, onDone }: Props) {
  const p = usePayment(parseRequestId(requestId));
  const customer = role === "user";
  const tone = paymentStatusTone(p.payment) as "success" | "warning" | "danger";
  const [choice, setChoice] = useState<"cash" | "online">("cash");
  // A started Stripe payment that hasn't succeeded can only be finished online.
  const online = p.payment ? p.payment.method !== "cash" : choice === "online";
  const choosing = customer && !p.payment;
  const showCheckout = customer && online && p.canPayOnline && !p.awaitingStripe;

  const footer = p.bundle ? (
    customer && !p.payment && !online ? (
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
          <RadioCard title="Cash" subtitle={customer ? "Pay to your provider" : "Collect from the customer"}
            selected={!online} disabled={!choosing && online} onPress={choosing ? () => setChoice("cash") : undefined} />
          <RadioCard title="Online Payment" subtitle={customer ? "Pay by card (Stripe)" : "Customer pays by card (Stripe)"}
            tag={p.stripeConfigured ? "Test mode" : "Not configured"}
            selected={online} disabled={!p.stripeConfigured || (!choosing && !online)}
            onPress={choosing ? () => setChoice("online") : undefined} />

          {customer && online && !p.stripeConfigured ? (
            <Banner tone="danger" message="Online payment needs EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_…) in mobile-app/.env." />
          ) : null}
          {customer && online && p.canPayOnline ? (
            <Text variant="caption" color="muted">Test card: 4242 4242 4242 4242 · any future date · any CVC</Text>
          ) : null}
          {customer && p.awaitingStripe ? <Banner message="Waiting for Stripe to confirm your payment. This updates automatically." /> : null}
          {p.notice ? <Banner message={p.notice} /> : null}
          {showCheckout ? (
            <StripeCheckout createIntent={p.startStripeCheckout} onResult={p.onStripeResult}
              onBusyChange={p.setStripeBusy} disabled={p.stripeBusy || p.busy} />
          ) : null}

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
