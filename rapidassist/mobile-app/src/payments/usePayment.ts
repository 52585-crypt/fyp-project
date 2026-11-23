import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useDispatchUpdates } from "../requests/DispatchProvider";
import { buildInvoiceDocument } from "./invoiceDocument";
import { confirmCashCollected, getPaymentBundle, submitPayment, type PaymentBundle } from "./payments.api";
import { createPaymentRefresh, keepConfirmedCash } from "./paymentRefresh";
import { printInvoice } from "./printInvoice";

const submissionId = () => `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const message = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/** Invoice + payment for one completed request. Cash is the only method offered in the UI. */
export function usePayment(requestId: string | null) {
  const { token } = useAuth();
  const { subscribeToPaymentUpdates } = useDispatchUpdates();
  const [bundle, setBundle] = useState<PaymentBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const pendingKey = useRef<string | null>(null);

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
  const toRupees = (minor: number) => minor / 100;
  return {
    bundle, payment, loading, busy, exporting, error, reload: load, payCash, confirmCash, exportInvoice,
    lines: bundle?.invoice.lines.map((l) => ({ label: l.label, amount: toRupees(l.amountMinor) })) ?? [],
    total: bundle ? toRupees(bundle.invoice.totalMinor) : 0,
    providerEarnings: bundle ? toRupees(bundle.invoice.providerEarningsMinor) : 0,
    paid: payment?.status === "paid" && (payment.method !== "cash" || Boolean(payment.cashCollectionRecorded)),
    awaitingCash: payment?.method === "cash" && !(payment.status === "paid" && payment.cashCollectionRecorded)
  };
}
