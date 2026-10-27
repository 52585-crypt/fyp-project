import { api } from "../config/api";

export type Invoice = {
  id: string;
  requestId: string;
  invoiceNumber: string;
  currency: "PKR";
  lines: Array<{ label: string; amountMinor: number }>;
  totalMinor: number;
  serviceFeeMinor: number;
  providerEarningsMinor: number;
  status: "finalized" | "void";
  finalizedAt: string;
};

export type Payment = {
  id: string;
  requestId: string;
  invoiceId: string;
  currency: "PKR";
  amountMinor: number;
  method: "cash" | "online_simulated";
  status: "pending" | "paid" | "failed";
  paidAt: string | null;
  createdAt: string;
};

export type PaymentBundle = { invoice: Invoice; payment: Payment | null };
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getPaymentBundle(token: string, requestId: string) {
  const response = await api.get<{ invoice: Invoice; payment: Payment | null }>(`/api/payments/request/${requestId}`, auth(token));
  return response.data;
}

export async function submitPayment(token: string, requestId: string, input: { method: Payment["method"]; simulationResult?: "success" | "failed"; idempotencyKey: string }) {
  const response = await api.post<PaymentBundle>(`/api/payments/request/${requestId}`, input, auth(token));
  return response.data;
}

export async function confirmCashCollected(token: string, requestId: string) {
  const response = await api.patch<{ payment: Payment }>(`/api/payments/request/${requestId}/cash-collected`, {}, auth(token));
  return response.data.payment;
}
