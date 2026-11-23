import { api } from "../config/api";

export type Invoice = {
  id: string;
  requestId: string;
  invoiceNumber: string;
  currency: string;
  lines: Array<{ label: string; amountMinor: number }>;
  totalMinor: number;
  serviceFeeMinor: number;
  providerEarningsMinor: number;
  status: "finalized" | "void";
  finalizedAt: string;
  stripePaidAt: string | null;
};

export type Payment = {
  id: string;
  requestId: string;
  invoiceId: string;
  currency: string;
  amountMinor: number;
  method: "cash" | "online_simulated" | "stripe";
  status: "pending" | "processing" | "paid" | "failed" | "canceled";
  stripeIntentId: string | null;
  stripeChargeId: string | null;
  paidAt: string | null;
  cashCollectionRecorded?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PaymentBundle = { invoice: Invoice; payment: Payment | null; simulationAllowed?: boolean };
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getPaymentBundle(token: string, requestId: string) {
  const response = await api.get<PaymentBundle>(`/api/payments/request/${requestId}`, auth(token));
  return response.data;
}

export async function submitPayment(token: string, requestId: string, input: { method: Exclude<Payment["method"], "stripe">; simulationResult?: "success" | "failed"; idempotencyKey: string }) {
  const response = await api.post<PaymentBundle>(`/api/payments/request/${requestId}`, input, auth(token));
  return response.data;
}

export async function confirmCashCollected(token: string, requestId: string) {
  const response = await api.patch<{ payment: Payment }>(`/api/payments/request/${requestId}/cash-collected`, {}, auth(token));
  return response.data.payment;
}

export async function createStripeIntent(token: string, invoiceId: string) {
  const response = await api.post<{ clientSecret: string | null; awaitingConfirmation: boolean }>(
    "/api/payments/stripe/create-intent", { invoiceId }, auth(token)
  );
  return response.data;
}

export async function listPayments(token: string, before?: string) {
  const response = await api.get<{ payments: Payment[]; next: string | null }>(
    "/api/payments/history", { ...auth(token), params: { before } }
  );
  return response.data;
}

export const paymentMethodNames = { cash: "Cash", online_simulated: "Simulated online", stripe: "Stripe test card" };

export function paymentStatusLabel(payment?: Payment | null) {
  if (!payment) return "Not selected";
  if (payment.status !== "paid") {
    const status = payment.status[0].toUpperCase() + payment.status.slice(1);
    if (payment.method === "stripe") return `Stripe test payment: ${status}`;
    if (payment.method === "online_simulated") return `Simulation: ${status}`;
    return status;
  }
  if (payment.method === "online_simulated") return "Simulation succeeded";
  if (payment.method === "stripe") return "Stripe test payment succeeded";
  return payment.cashCollectionRecorded ? "Cash collected" : "Cash confirmation unverified";
}

export function paymentStatusTone(payment?: Payment | null) {
  if (payment?.status === "failed") return "danger";
  if (payment?.status === "paid" && (payment.method !== "cash" || payment.cashCollectionRecorded)) return "success";
  return "warning";
}

export const formatPaymentAmount = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
