import type { PaymentBundle } from "./payments.api";

export function createPaymentRefresh(read: () => Promise<PaymentBundle>) {
  let inFlight: Promise<PaymentBundle> | null = null;
  let queued: Promise<PaymentBundle> | null = null;

  function refresh(): Promise<PaymentBundle> {
    if (inFlight) return inFlight;
    inFlight = read().finally(() => { inFlight = null; });
    return inFlight;
  }

  // An event can arrive while a response containing the old payment is in flight.
  function afterChange(): Promise<PaymentBundle> {
    if (queued) return queued;
    if (!inFlight) return refresh();
    queued = inFlight.catch(() => {}).then(() => {
      queued = null;
      return refresh();
    });
    return queued;
  }

  return { refresh, afterChange };
}

export function keepConfirmedCash(previous: PaymentBundle | null, incoming: PaymentBundle) {
  if (previous?.invoice.id === incoming.invoice.id && previous.payment?.method === "cash" &&
    previous.payment.status === "paid" && previous.payment.cashCollectionRecorded &&
    (incoming.payment?.status !== "paid" || !incoming.payment.cashCollectionRecorded)) {
    return { ...incoming, payment: previous.payment };
  }
  return incoming;
}
