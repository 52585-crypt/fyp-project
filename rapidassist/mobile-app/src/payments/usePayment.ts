import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useDispatchUpdates } from "../requests/DispatchProvider";
import { buildInvoiceDocument } from "./invoiceDocument";
import { confirmCashCollected, createStripeIntent, getPaymentBundle, submitPayment, type PaymentBundle } from "./payments.api";
import { createPaymentRefresh, keepConfirmedCash } from "./paymentRefresh";
import { printInvoice } from "./printInvoice";
import type { CheckoutResult } from "./stripeCheckout.types";
import { stripeTestKey } from "./stripeConfig";

const submissionId = () => `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/** Invoice + payment for one completed request: cash, or a Stripe test-mode card payment. */
export function usePayment(requestId: string | null) {
  const { token } = useAuth();
  const { subscribeToPaymentUpdates } = useDispatchUpdates();
  const [bundle, setBundle] = useState<PaymentBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [waitingForStripe, setWaitingForStripe] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncCycle, setSyncCycle] = useState(0);
  const submitting = useRef(false);
  const pendingKey = useRef<string | null>(null);
  const previousStripeResult = useRef<string | null>(null);

  const refresher = useMemo(() => token && requestId ? createPaymentRefresh(() => getPaymentBundle(token, requestId)) : null, [token, requestId]);
  const apply = useCallback((next: PaymentBundle) => setBundle((prev) => keepConfirmedCash(prev, next)), []);

  const load = useCallback(async () => {
    if (!refresher) { setLoading(false); setError("Open payment from a completed job."); return; }
    setLoading(true);
    try { apply(await refresher.refresh()); setError(null); }
    catch (e) { setError(message(e, "Unable to load invoice")); }
    finally { setLoading(false); }
  }, [apply, refresher]);

  useFocusEffect(useCallback(() => {
    void load();
    let active = true;
    let lastEventId: string | undefined;
    const stop = subscribeToPaymentUpdates((changedId, eventId) => {
      if (!refresher || changedId !== requestId || (eventId && eventId === lastEventId)) return;
      lastEventId = eventId;
      void refresher.afterChange().then((next) => { if (active) apply(next); }).catch(() => undefined);
    });
    return () => { active = false; stop(); };
  }, [apply, load, refresher, requestId, subscribeToPaymentUpdates]));

  // Stripe confirms through its webhook, so poll the invoice until the result arrives.
  const stripeStatus = bundle?.payment?.method === "stripe" ? bundle.payment.status : null;
  useEffect(() => {
    if (!refresher || (!waitingForStripe && stripeStatus !== "processing" && syncCycle === 0)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const maxAttempts = waitingForStripe || stripeStatus === "processing" ? 24 : 6;

    async function sync() {
      if (!refresher) return;
      attempts += 1;
      try {
        const updated = await refresher.refresh();
        if (!active) return;
        apply(updated);
        const status = updated.payment?.status;
        const isNewResult = updated.payment?.updatedAt !== previousStripeResult.current;
        if (status === "paid" || ((status === "failed" || status === "canceled") && isNewResult)) {
          setWaitingForStripe(false);
          if (status === "paid") { setNotice(null); setError(null); }
          return;
        }
        if (!waitingForStripe && updated.payment?.status !== "processing") return;
      } catch {
        // The webhook may still land after a temporary network failure.
      }
      if (!active) return;
      if (attempts < maxAttempts) timer = setTimeout(() => void sync(), attempts < 12 ? 2000 : 5000);
      else if (waitingForStripe) {
        setWaitingForStripe(false);
        setNotice("Card confirmation is taking longer than expected. Pull down to refresh.");
      }
    }

    void sync();
    return () => { active = false; clearTimeout(timer); };
  }, [apply, refresher, stripeStatus, syncCycle, waitingForStripe]);

  /** Customer: create (or reuse) the Stripe PaymentIntent and hand its client secret to the checkout UI. */
  async function startStripeCheckout() {
    if (!token || !bundle) return null;
    setError(null);
    setNotice(null);
    try {
      const intent = await createStripeIntent(token, bundle.invoice.id);
      if (intent.awaitingConfirmation) onStripeResult("submitted");
      else setSyncCycle((cycle) => cycle + 1);
      return intent.clientSecret;
    } catch (e) {
      setError(message(e, "Unable to start card checkout. Please try again."));
      return null;
    }
  }

  function onStripeResult(result: CheckoutResult, failure?: string) {
    const current = bundle?.payment;
    previousStripeResult.current = result === "submitted" && (current?.status === "failed" || current?.status === "canceled")
      ? current.updatedAt : null;
    setWaitingForStripe(result === "submitted");
    setNotice(result === "canceled" ? "Card checkout canceled. You can open it again to retry." : null);
    setError(failure ?? null);
    setSyncCycle((cycle) => cycle + 1);
  }

  async function run(action: () => Promise<void>, fallback: string) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try { await action(); } catch (e) { setError(message(e, fallback)); } finally { submitting.current = false; setBusy(false); }
  }

  /** Customer: choose cash. Re-uses the same idempotency key on retry. */
  const payCash = () => run(async () => {
    if (!token || !requestId) return;
    pendingKey.current ??= submissionId();
    apply(await submitPayment(token, requestId, { method: "cash", idempotencyKey: pendingKey.current }));
    pendingKey.current = null;
  }, "Payment could not be processed");

  /** Provider: record that the customer's cash was collected. */
  const confirmCash = () => run(async () => {
    if (!token || !requestId || !bundle) return;
    const payment = await confirmCashCollected(token, requestId);
    setBundle({ ...bundle, payment });
  }, "Unable to confirm cash");

  async function exportInvoice() {
    if (!bundle || exporting) return;
    setExporting(true);
    setError(null);
    try { await printInvoice(buildInvoiceDocument(bundle)); }
    catch (e) { setError(message(e, "Unable to export the invoice. Please try again.")); }
    finally { setExporting(false); }
  }

  const payment = bundle?.payment ?? null;
  const stripeConfigured = Boolean(stripeTestKey);
  const canPayOnline = stripeConfigured && bundle?.invoice.status === "finalized" &&
    (!payment || (payment.method === "stripe" && payment.status !== "paid"));
  const toRupees = (minor: number) => minor / 100;
  return {
    bundle, payment, loading, busy, exporting, error, notice, reload: load, payCash, confirmCash, exportInvoice,
    stripeConfigured, canPayOnline, startStripeCheckout, onStripeResult, stripeBusy, setStripeBusy,
    awaitingStripe: waitingForStripe || payment?.status === "processing",
    lines: bundle?.invoice.lines.map((l) => ({ label: l.label, amount: toRupees(l.amountMinor) })) ?? [],
    total: bundle ? toRupees(bundle.invoice.totalMinor) : 0,
    providerEarnings: bundle ? toRupees(bundle.invoice.providerEarningsMinor) : 0,
    paid: payment?.status === "paid" && (payment.method !== "cash" || Boolean(payment.cashCollectionRecorded)),
    awaitingCash: payment?.method === "cash" && !(payment.status === "paid" && payment.cashCollectionRecorded)
  };
}
