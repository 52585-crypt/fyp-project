import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { AppShell, BottomNav, Card, PrimaryButton, StatusPill } from "../ui/components";
import { ui } from "../ui/system";
import { confirmCashCollected, createStripeIntent, formatPaymentAmount, getPaymentBundle, paymentMethodNames, paymentStatusLabel, paymentStatusTone, PaymentBundle, submitPayment } from "./payments.api";
import { StripeCheckout } from "./StripeCheckout";
import { stripeTestKey } from "./stripeConfig";
import { buildInvoiceDocument } from "./invoiceDocument";
import { printInvoice } from "./printInvoice";
import { createPaymentRefresh, keepConfirmedCash } from "./paymentRefresh";
import { useDispatchUpdates } from "../requests/DispatchProvider";
import type { CheckoutResult } from "./stripeCheckout.types";

const submissionId = () => `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function PaymentDetails({ requestId, role }: { requestId?: string; role: "user" | "provider" }) {
  const { token, user } = useAuth();
  return <PaymentDetailsScreen key={JSON.stringify([user?.id, requestId, role])} token={token} requestId={requestId} role={role} />;
}

function PaymentDetailsScreen({ token, requestId, role }: { token: string | null; requestId?: string; role: "user" | "provider" }) {
  const { subscribeToPaymentUpdates } = useDispatchUpdates();
  const [bundle, setBundle] = useState<PaymentBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [waitingForStripe, setWaitingForStripe] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [syncCycle, setSyncCycle] = useState(0);
  const [exporting, setExporting] = useState(false);
  const previousStripeResult = useRef<string | null>(null);
  const pendingSubmission = useRef<{ requestId: string; method: string; simulationResult?: string; key: string } | null>(null);

  const paymentRefresh = useMemo(() => token && requestId
    ? createPaymentRefresh(() => getPaymentBundle(token, requestId)) : null, [token, requestId]);

  const applyBundle = useCallback((updated: PaymentBundle) => {
    setBundle((previous) => keepConfirmedCash(previous, updated));
  }, []);

  const load = useCallback(async () => {
    if (!paymentRefresh) { setLoading(false); setError("Open payment from a completed job."); return; }
    setLoading(true);
    try { applyBundle(await paymentRefresh.refresh()); setError(""); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || "Unable to load invoice"); }
    finally { setLoading(false); }
  }, [applyBundle, paymentRefresh]);

  useFocusEffect(useCallback(() => {
    if (role !== "user") return;
    void load();
    let active = true;
    let lastEventId: string | undefined;
    const stop = subscribeToPaymentUpdates((changedRequestId, eventId) => {
      if (!paymentRefresh || changedRequestId !== requestId || (eventId && eventId === lastEventId)) return;
      lastEventId = eventId;
      void paymentRefresh.afterChange().then((updated) => {
        if (!active) return;
        applyBundle(updated);
        if (updated.payment?.cashCollectionRecorded) setError("");
      }).catch(() => { /* Keep the last valid invoice on temporary failures. */ });
    });
    return () => { active = false; stop(); };
  }, [applyBundle, load, paymentRefresh, requestId, role, subscribeToPaymentUpdates]));

  useEffect(() => {
    if (role !== "user") void load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setSyncCycle((cycle) => cycle + 1);
    });
    return () => subscription.remove();
  }, [load, role]);

  const payment = bundle?.payment;
  const stripeStatus = payment?.method === "stripe" ? payment.status : null;

  useEffect(() => {
    if (!paymentRefresh || (!stripeStatus && syncCycle === 0)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const maxAttempts = waitingForStripe || stripeStatus === "processing" ? 24 : 12;

    async function sync() {
      if (!paymentRefresh) return;
      attempts += 1;
      try {
        const updated = await paymentRefresh.refresh();
        if (!active) return;
        applyBundle(updated);
        const status = updated.payment?.status;
        const isNewResult = updated.payment?.updatedAt !== previousStripeResult.current;
        if (status === "paid" || ((status === "failed" || status === "canceled") && isNewResult)) {
          setWaitingForStripe(false);
          if (status === "paid") {
            setCheckoutMessage("");
            setError("");
          }
          return;
        }
        if (!waitingForStripe && updated.payment?.method !== "stripe") return;
      } catch {
        // A webhook may still arrive during a temporary API or network failure.
      }
      if (!active) return;
      if (attempts < maxAttempts) timer = setTimeout(() => void sync(), attempts < 12 ? 2000 : 5000);
      else if (waitingForStripe) {
        setWaitingForStripe(false);
        setCheckoutMessage("Stripe confirmation is taking longer than expected. Refresh to check the latest status.");
      }
    }

    void sync();
    return () => { active = false; clearTimeout(timer); };
  }, [applyBundle, paymentRefresh, stripeStatus, syncCycle, waitingForStripe]);

  async function startStripeCheckout() {
    if (!token || !bundle) return null;
    setError("");
    setCheckoutMessage("");
    try {
      const intent = await createStripeIntent(token, bundle.invoice.id);
      if (intent.awaitingConfirmation) onCheckoutResult("submitted");
      else setSyncCycle((cycle) => cycle + 1);
      return intent.clientSecret;
    } catch (error: any) {
      setError(error?.response?.data?.message || "Unable to start Stripe checkout. Please try again.");
      return null;
    }
  }

  function onCheckoutResult(result: CheckoutResult, message?: string) {
    previousStripeResult.current = result === "submitted" && (payment?.status === "failed" || payment?.status === "canceled")
      ? payment.updatedAt : null;
    setWaitingForStripe(result === "submitted");
    setCheckoutMessage(result === "canceled" ? "Card checkout canceled. You can reopen it to retry." : "");
    if (message) setError(message);
    else setError("");
    setSyncCycle((cycle) => cycle + 1);
  }

  const money = (minor: number) => formatPaymentAmount(minor, bundle?.invoice.currency || "PKR");
  const showStripe = role === "user" && stripeTestKey && bundle?.invoice.status === "finalized" &&
    (!payment || (payment.method === "stripe" && payment.status !== "paid"));
  const awaitingStripe = waitingForStripe || payment?.status === "processing";

  const submittingPayment = useRef(false);

  async function pay(method: "cash" | "online_simulated", simulationResult?: "success" | "failed") {
    if (!token || !requestId || submittingPayment.current) return;
    submittingPayment.current = true;
    try {
      setBusy(true); setError("");
      const pending = pendingSubmission.current;
      if (!pending || pending.requestId !== requestId || pending.method !== method || pending.simulationResult !== simulationResult) {
        pendingSubmission.current = { requestId, method, simulationResult, key: submissionId() };
      }
      applyBundle(await submitPayment(token, requestId, { method, simulationResult, idempotencyKey: pendingSubmission.current!.key }));
      pendingSubmission.current = null;
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || "Payment could not be processed"); }
    finally { submittingPayment.current = false; setBusy(false); }
  }

  async function exportInvoice() {
    if (!bundle || exporting) return;
    try {
      setExporting(true); setError("");
      await printInvoice(buildInvoiceDocument(bundle));
    } catch (error: any) {
      setError(error?.message || "Unable to export the invoice. Please try again.");
    } finally { setExporting(false); }
  }

  return <View style={{ flex: 1 }}>
    <AppShell title="Payment & Invoice" subtitle={bundle?.invoice.invoiceNumber || "Final bill for the completed job"} right={<PrimaryButton title="Refresh" icon="refresh" variant="outline" onPress={() => { setSyncCycle((cycle) => cycle + 1); void load(); }} />}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {bundle ? <>
        <Card style={styles.invoice}>
          {bundle.invoice.lines.map((line) => <View key={line.label} style={styles.row}><Text style={styles.label}>{line.label}</Text><Text style={styles.value}>{money(line.amountMinor)}</Text></View>)}
          <View style={[styles.row, styles.total]}><Text style={styles.totalText}>Total</Text><Text style={styles.totalText}>{money(bundle.invoice.totalMinor)}</Text></View>
          <View style={styles.status}><Text style={styles.label}>Payment status</Text><StatusPill label={paymentStatusLabel(payment)} tone={paymentStatusTone(payment)} /></View>
          {payment ? <Text style={styles.label}>{paymentMethodNames[payment.method]}{payment.paidAt ? ` · ${new Date(payment.paidAt).toLocaleString()}` : ""}</Text> : null}
          <PrimaryButton title={exporting ? "Exporting…" : "Export Invoice PDF"} disabled={exporting} icon="share" variant="outline" onPress={() => void exportInvoice()} />
        </Card>

        {showStripe || (role === "user" && !payment) ? <Card style={styles.actions}>
          <Text style={styles.heading}>{payment ? "Card payment" : "Choose payment method"}</Text>
          {showStripe ? <Text style={styles.label}>Stripe Test Mode · Use a Stripe test card</Text> : null}
          {checkoutMessage ? <Text style={styles.label}>{checkoutMessage}</Text> : null}
          {awaitingStripe ? <Text style={styles.label}>Waiting for Stripe confirmation. Refresh to check the latest status.</Text> : null}
          {showStripe && !awaitingStripe ? <StripeCheckout createIntent={startStripeCheckout} onResult={onCheckoutResult}
            onBusyChange={setStripeBusy} disabled={stripeBusy || busy} /> : null}
          {!payment && !stripeBusy ? <>
            <PrimaryButton title="Pay Cash" icon="cash" variant="outline" disabled={busy} onPress={() => void pay("cash")} />
            {bundle.simulationAllowed ? <>
              <PrimaryButton title="Simulate Online Success" icon="card" variant="success" disabled={busy} onPress={() => void pay("online_simulated", "success")} />
              <PrimaryButton title="Simulate Online Failure" icon="close-circle" variant="danger" disabled={busy} onPress={() => void pay("online_simulated", "failed")} />
            </> : null}
          </> : null}
        </Card> : null}
        {role === "user" && bundle.simulationAllowed && payment?.method === "online_simulated" && payment.status === "failed" ? <PrimaryButton title="Retry Simulated Payment" icon="refresh" variant="success" disabled={busy} onPress={() => void pay("online_simulated", "success")} /> : null}
        {role === "provider" && payment?.method === "cash" && payment.status === "pending" ? <PrimaryButton title="Confirm Cash Collected" icon="checkmark-circle" variant="success" disabled={busy} onPress={async () => {
          if (!token || !requestId || submittingPayment.current) return;
          submittingPayment.current = true;
          try { setBusy(true); const updated = await confirmCashCollected(token, requestId); setBundle({ ...bundle, payment: updated }); }
          catch (e: any) { setError(e?.response?.data?.message || e?.message || "Unable to confirm cash"); }
          finally { submittingPayment.current = false; setBusy(false); }
        }} /> : null}
      </> : loading ? <Text style={styles.empty}>Loading finalized invoice…</Text> : null}
    </AppShell>
    <BottomNav role={role} active={role === "provider" ? "Earn" : "Activity"} />
  </View>;
}

const styles = StyleSheet.create({
  invoice: { gap: 13 }, actions: { marginTop: 14, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  label: { flex: 1, color: ui.colors.muted, fontSize: 13, fontWeight: "700" },
  value: { color: ui.colors.text, fontSize: 13, fontWeight: "900" },
  total: { borderTopWidth: 1, borderTopColor: ui.colors.border, paddingTop: 13 },
  totalText: { color: ui.colors.text, fontSize: 17, fontWeight: "900" },
  status: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { color: ui.colors.text, fontSize: 16, fontWeight: "900" },
  error: { color: ui.colors.danger, marginBottom: 12, fontWeight: "700" },
  empty: { color: ui.colors.muted, textAlign: "center", marginTop: 30 }
});
